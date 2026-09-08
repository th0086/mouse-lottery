import { BadRequestException, Body, Controller, Get, Logger, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { CallbackService } from "./callbacks/callback.service";
import { CreateEntryDto, PushNumberDto } from "./draws/draws.dto";
import { DrawsService } from "./draws/draws.service";
import { MerchantService } from "./merchants/merchant.service";
import { UsersService } from "./users/users.service";

@Controller("game")
export class GameController {
  private readonly logger = new Logger(GameController.name);

  constructor(
    private readonly drawsService: DrawsService,
    private readonly usersService: UsersService,
    private readonly merchantService: MerchantService,
    private readonly callbackService: CallbackService,
  ) {}

  @Get("state")
  async getState() {
    return this.drawsService.getPublicState();
  }

  @UseGuards(JwtAuthGuard)
  @Post("entries")
  async createEntry(
    @Req() req: { user: { sub: string; authMethod?: string } },
    @Body() dto: CreateEntryDto,
  ) {
    const user = await this.usersService.findById(req.user.sub);
    const isExternalSession = req.user.authMethod === "external";
    const merchantId = isExternalSession ? user?.externalMerchant : undefined;
    const externalToken = isExternalSession ? user?.externalToken : undefined;

    if (isExternalSession) {
      const consumeResult = await this.usersService.consumeDailyBetAllowance(req.user.sub);
      if (!consumeResult?.ok) {
        throw new BadRequestException("No remaining daily bet chances. Please refresh to sync latest daily deposit status.");
      }
    }

    const entry = await this.drawsService.createEntry(req.user.sub, dto.numbers, merchantId);

    const finalizeExternalCallback = (callbackResponse: { error?: boolean; success?: boolean; message?: string; data?: { depositAmount?: string; betAmount?: string; betCount?: number } }) => {
      return Promise.all([
        this.drawsService.updateEntryWithCallbackResponse(entry.id, callbackResponse),
        this.usersService.applyExternalCallbackProfileUpdate(req.user.sub, callbackResponse),
      ]);
    };

    if (isExternalSession && (!merchantId || !externalToken)) {
      void finalizeExternalCallback({
        error: true,
        message: "Missing external merchant/token for callback",
      });
      return entry;
    }

    if (merchantId && externalToken && isExternalSession) {
      const callbackUrl = this.merchantService.getCallbackUrl(merchantId);

      if (callbackUrl) {
        void this.callbackService
          .postBetConfirmation(callbackUrl, externalToken)
          .then((callbackResponse) => finalizeExternalCallback(callbackResponse))
          .catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Callback processing failed for entry=${entry.id}: ${message}`);
            return finalizeExternalCallback({
              error: true,
              message,
            });
          });
      } else {
        void finalizeExternalCallback({
          error: true,
          message: `Missing callback URL for merchant ${merchantId}`,
        });
      }
    }

    return entry;
  }

  @UseGuards(JwtAuthGuard)
  @Get("my-entries")
  async myEntries(@Req() req: { user: { sub: string } }) {
    return this.drawsService.getEntriesForUser(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get("my-wallet-credits")
  async myWalletCredits(@Req() req: { user: { sub: string } }) {
    return this.drawsService.getWalletCreditsForUser(req.user.sub);
  }

  /** External draw machine pushes one number at a time */
  @Post("push")
  async pushNumber(@Req() req: Request, @Body() dto: PushNumberDto) {
    const origin = req.headers.origin ?? "<no-origin>";
    const userAgent = req.headers["user-agent"] ?? "<unknown-ua>";
    const forwardedFor = req.headers["x-forwarded-for"];
    const clientIp =
      typeof forwardedFor === "string"
        ? forwardedFor.split(",")[0].trim()
        : req.ip;

    this.logger.log(
      `POST /game/push origin=${origin} ip=${clientIp} ua=${userAgent} payload=${JSON.stringify(dto)}`,
    );

    return this.drawsService.pushNumber(dto.data.number, dto.data.timestamp, dto.created_at);
  }
}
