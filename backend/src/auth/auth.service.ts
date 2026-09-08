import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { CallbackService } from "../callbacks/callback.service";
import { MerchantService } from "../merchants/merchant.service";
import { UsersService } from "../users/users.service";
import { ExternalLoginDto, LoginDto, RegisterDto } from "./dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly merchantService: MerchantService,
    private readonly callbackService: CallbackService,
  ) {}

  async register(dto: RegisterDto) {
    const normalizedPhone = this.normalizeKenyaPhone(dto.phone);
    const existing = await this.usersService.findByPhone(normalizedPhone);
    if (existing) {
      throw new UnauthorizedException("Phone already registered");
    }

    const user = await this.usersService.createPlayer(normalizedPhone, dto.password);
    const allowance = await this.usersService.getDailyBetAllowance(user.id);
    return this.issueTokens(
      user.id,
      user.phone,
      user.role,
      user.permissions,
      user.walletBalanceKES,
      user.walletCurrency,
      user.depositAmount ?? "0.00",
      user.betAmount ?? "0.00",
      allowance?.total ?? 0,
      allowance?.used ?? 0,
      allowance?.remaining ?? 0,
      "local",
    );
  }

  async login(dto: LoginDto) {
    const normalizedPhone = this.normalizeKenyaPhone(dto.phone);
    const user = await this.usersService.findByPhone(normalizedPhone);
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const valid = await this.usersService.validatePassword(user, dto.password);
    if (!valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const allowance = await this.usersService.getDailyBetAllowance(user.id);
    return this.issueTokens(
      user.id,
      user.phone,
      user.role,
      user.permissions,
      user.walletBalanceKES,
      user.walletCurrency,
      user.depositAmount ?? "0.00",
      user.betAmount ?? "0.00",
      allowance?.total ?? 0,
      allowance?.used ?? 0,
      allowance?.remaining ?? 0,
      "local",
    );
  }

  async externalLogin(dto: ExternalLoginDto) {
    const externalPhone = this.normalizeExternalPhone(dto.phone);
    const merchant = dto.merchant.trim();
    const token = dto.token.trim();
    const ref = dto.ref?.trim() || undefined;

    if (!this.merchantService.isValidMerchant(merchant)) {
      throw new BadRequestException("Invalid merchant");
    }

    let user = await this.usersService.findByPhone(externalPhone);
    if (!user) {
      user = await this.usersService.createExternalPlayer(externalPhone);
    }

    await this.usersService.upsertExternalLoginToken(user.id, merchant, token, ref);

    const callbackUrl = this.merchantService.getCallbackUrl(merchant);
    if (callbackUrl) {
      const callbackResponse = await this.callbackService.postBetConfirmation(callbackUrl, token);
      await this.usersService.applyExternalCallbackProfileUpdate(user.id, callbackResponse);
    }

    const refreshedUser = (await this.usersService.findById(user.id)) ?? user;
    const allowance = await this.usersService.getDailyBetAllowance(refreshedUser.id);

    return this.issueTokens(
      refreshedUser.id,
      refreshedUser.phone,
      refreshedUser.role,
      refreshedUser.permissions,
      refreshedUser.walletBalanceKES,
      refreshedUser.walletCurrency,
      refreshedUser.depositAmount ?? "0.00",
      refreshedUser.betAmount ?? "0.00",
      allowance?.total ?? 0,
      allowance?.used ?? 0,
      allowance?.remaining ?? 0,
      "external",
    );
  }

  async syncExternalStatus(userId: string, authMethod?: string) {
    if (authMethod !== "external") {
      return { synced: false };
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      return { synced: false };
    }

    const merchantId = user.externalMerchant;
    const externalToken = user.externalToken;
    if (!merchantId || !externalToken) {
      return { synced: false };
    }

    const callbackUrl = this.merchantService.getCallbackUrl(merchantId);
    if (!callbackUrl) {
      return { synced: false };
    }

    const callbackResponse = await this.callbackService.postBetConfirmation(callbackUrl, externalToken);
    await this.usersService.applyExternalCallbackProfileUpdate(user.id, callbackResponse);

    return { synced: true };
  }

  async refresh(refreshToken: string) {
    const payload = await this.jwtService.verifyAsync<{
      sub: string;
      phone: string;
      role: string;
      permissions: string[];
      authMethod?: string;
    }>(refreshToken, {
      secret: this.configService.get<string>("JWT_REFRESH_SECRET") ?? "refresh-secret",
    });

    const user = await this.usersService.findById(payload.sub);
    const walletBalanceKES = user?.walletBalanceKES ?? 0;
    const walletCurrency = user?.walletCurrency ?? "KES";
    const allowance = await this.usersService.getDailyBetAllowance(payload.sub);
    const inferredAuthMethod: "local" | "external" =
      payload.authMethod === "external" || (user?.externalMerchant && user?.externalToken)
        ? "external"
        : "local";

    return this.issueTokens(
      payload.sub,
      payload.phone,
      payload.role,
      payload.permissions,
      walletBalanceKES,
      walletCurrency,
      user?.depositAmount ?? "0.00",
      user?.betAmount ?? "0.00",
      allowance?.total ?? 0,
      allowance?.used ?? 0,
      allowance?.remaining ?? 0,
      inferredAuthMethod,
    );
  }

  private async issueTokens(
    sub: string,
    phone: string,
    role: string,
    permissions: string[],
    walletBalanceKES: number,
    walletCurrency: string,
    depositAmount: string,
    betAmount: string,
    dailyBetAllowanceTotal: number,
    dailyBetAllowanceUsed: number,
    dailyBetAllowanceRemaining: number,
    authMethod: "local" | "external" = "local",
  ) {
    const payload = { sub, phone, role, permissions, authMethod };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>("JWT_ACCESS_SECRET") ?? "access-secret",
      expiresIn: this.configService.get<string>("JWT_ACCESS_EXPIRES_IN") ?? "15m",
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>("JWT_REFRESH_SECRET") ?? "refresh-secret",
      expiresIn: this.configService.get<string>("JWT_REFRESH_EXPIRES_IN") ?? "7d",
    });

    return {
      user: {
        id: sub,
        phone,
        role,
        permissions,
        walletBalanceKES,
        walletCurrency,
        depositAmount,
        betAmount,
        dailyBetAllowanceTotal,
        dailyBetAllowanceUsed,
        dailyBetAllowanceRemaining,
      },
      accessToken,
      refreshToken,
    };
  }

  private normalizeKenyaPhone(phone: string): string {
    const value = phone.trim();
    if (/^\+254[71]\d{8}$/.test(value)) {
      return value;
    }

    if (/^0[71]\d{8}$/.test(value)) {
      return `+254${value.slice(1)}`;
    }

    throw new UnauthorizedException("Please enter a valid Kenyan mobile number.");
  }

  private normalizeExternalPhone(phone: string): string {
    const value = phone.trim();
    if (!value) {
      throw new UnauthorizedException("Phone is required.");
    }

    return value;
  }
}
