import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { MerchantService } from "../merchants/merchant.service";
import { UsersService } from "../users/users.service";
import { AuthService } from "./auth.service";
import { ClaimMissionDto, ExternalLoginDto, LoginDto, RefreshDto, RegisterDto } from "./dto";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly merchantService: MerchantService,
  ) {}

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post("external-login")
  async externalLogin(@Body() dto: ExternalLoginDto) {
    try {
      return await this.authService.externalLogin(dto);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw new HttpException({ success: false, error: "Invalid merchant" }, HttpStatus.BAD_REQUEST);
      }
      throw error;
    }
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post("sync-external-status")
  async syncExternalStatus(@Req() req: { user: { sub: string; authMethod?: string } }) {
    return this.authService.syncExternalStatus(req.user.sub, req.user.authMethod);
  }

  @UseGuards(JwtAuthGuard)
  @Post("missions/claim")
  claimMission(
    @Req() req: { user: { sub: string } },
    @Body() dto: ClaimMissionDto,
  ) {
    return this.usersService.claimMissionReward(req.user.sub, dto.missionId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("refresh-missions")
  async refreshMissions(@Req() req: { user: { sub: string; phone: string; role: string; permissions: string[]; authMethod?: string } }) {
    const { sub, phone, role, permissions, authMethod } = req.user;
    // Sync and refresh user mission state
    await this.usersService.syncUserMissionState(sub);
    
    const user = await this.usersService.findById(sub);
    const allowance = await this.usersService.getDailyBetAllowance(sub);
    const dayKey = allowance?.dayKey ?? "";
    const missionThresholds = await this.usersService.getActiveMissionThresholds(dayKey || undefined);
    const externalMerchant = user?.externalMerchant ?? null;
    const externalRef = user?.externalRef ?? null;
    const inviteLink =
      externalMerchant && externalRef
        ? this.merchantService.buildInviteLink(externalMerchant, externalRef)
        : null;
    const missions = this.usersService.getMissionStatusSnapshot(user, dayKey);

    return {
      id: sub,
      phone,
      role,
      permissions,
      authMethod: authMethod ?? "local",
      externalMerchant,
      externalRef,
      inviteLink,
      dailyLoginCompletedToday: missions.dailyLoginCompletedToday,
      inviteMissionCompletedToday: missions.inviteMissionCompletedToday,
      placeBetCompletedToday: missions.placeBetCompletedToday,
      turnover1000CompletedToday: missions.turnover1000CompletedToday,
      deposit99CompletedToday: missions.deposit99CompletedToday,
      completeAllCompletedToday: missions.completeAllCompletedToday,
      dailyLoginReceivedToday: missions.dailyLoginReceivedToday,
      inviteMissionReceivedToday: missions.inviteMissionReceivedToday,
      placeBetReceivedToday: missions.placeBetReceivedToday,
      turnover1000ReceivedToday: missions.turnover1000ReceivedToday,
      deposit99ReceivedToday: missions.deposit99ReceivedToday,
      completeAllReceivedToday: missions.completeAllReceivedToday,
      turnoverMissionThreshold: missionThresholds.turnoverMissionThreshold,
      depositMissionThreshold: missionThresholds.depositMissionThreshold,
      canAccessAdmin: permissions.includes("admin:access"),
      canAccessData: permissions.includes("data:read"),
      walletBalanceKES: user?.walletBalanceKES ?? 0,
      walletCurrency: user?.walletCurrency ?? "KES",
      depositAmount: user?.depositAmount ?? "0.00",
      betAmount: user?.betAmount ?? "0.00",
      dailyBetAllowanceTotal: allowance?.total ?? 0,
      dailyBetAllowanceUsed: allowance?.used ?? 0,
      dailyBetAllowanceRemaining: allowance?.remaining ?? 0,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@Req() req: { user: { sub: string; phone: string; role: string; permissions: string[]; authMethod?: string } }) {
    const { sub, phone, role, permissions, authMethod } = req.user;
    const user = await this.usersService.findById(sub);
    const allowance = await this.usersService.getDailyBetAllowance(sub);
    const dayKey = allowance?.dayKey ?? "";
    const missionThresholds = await this.usersService.getActiveMissionThresholds(dayKey || undefined);
    const externalMerchant = user?.externalMerchant ?? null;
    const externalRef = user?.externalRef ?? null;
    const inviteLink =
      externalMerchant && externalRef
        ? this.merchantService.buildInviteLink(externalMerchant, externalRef)
        : null;
    const missions = this.usersService.getMissionStatusSnapshot(user, dayKey);

    return {
      id: sub,
      phone,
      role,
      permissions,
      authMethod: authMethod ?? "local",
      externalMerchant,
      externalRef,
      inviteLink,
      dailyLoginCompletedToday: missions.dailyLoginCompletedToday,
      inviteMissionCompletedToday: missions.inviteMissionCompletedToday,
      placeBetCompletedToday: missions.placeBetCompletedToday,
      turnover1000CompletedToday: missions.turnover1000CompletedToday,
      deposit99CompletedToday: missions.deposit99CompletedToday,
      completeAllCompletedToday: missions.completeAllCompletedToday,
      dailyLoginReceivedToday: missions.dailyLoginReceivedToday,
      inviteMissionReceivedToday: missions.inviteMissionReceivedToday,
      placeBetReceivedToday: missions.placeBetReceivedToday,
      turnover1000ReceivedToday: missions.turnover1000ReceivedToday,
      deposit99ReceivedToday: missions.deposit99ReceivedToday,
      completeAllReceivedToday: missions.completeAllReceivedToday,
      turnoverMissionThreshold: missionThresholds.turnoverMissionThreshold,
      depositMissionThreshold: missionThresholds.depositMissionThreshold,
      canAccessAdmin: permissions.includes("admin:access"),
      canAccessData: permissions.includes("data:read"),
      walletBalanceKES: user?.walletBalanceKES ?? 0,
      walletCurrency: user?.walletCurrency ?? "KES",
      depositAmount: user?.depositAmount ?? "0.00",
      betAmount: user?.betAmount ?? "0.00",
      dailyBetAllowanceTotal: allowance?.total ?? 0,
      dailyBetAllowanceUsed: allowance?.used ?? 0,
      dailyBetAllowanceRemaining: allowance?.remaining ?? 0,
    };
  }
}
