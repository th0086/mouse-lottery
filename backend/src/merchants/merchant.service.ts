import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export const SUPPORTED_MERCHANTS = ["ke7stg", "ke7prod"] as const;
export type SupportedMerchant = (typeof SUPPORTED_MERCHANTS)[number];

@Injectable()
export class MerchantService {
  constructor(private readonly configService: ConfigService) {}

  isValidMerchant(merchantId: string): merchantId is SupportedMerchant {
    return SUPPORTED_MERCHANTS.includes(merchantId as SupportedMerchant);
  }

  getCallbackUrl(merchantId: string): string | null {
    if (merchantId === "ke7stg") {
      return this.readUrl("MERCHANT_KE7STG_CALLBACK_URL");
    }

    if (merchantId === "ke7prod") {
      return this.readUrl("MERCHANT_KE7PROD_CALLBACK_URL");
    }

    return null;
  }

  getInviteBaseUrl(merchantId: string): string | null {
    if (merchantId === "ke7stg") {
      return this.readInviteUrl("MERCHANT_KE7STG_INVITE_URL");
    }

    if (merchantId === "ke7prod") {
      return this.readInviteUrl("MERCHANT_KE7PROD_INVITE_URL");
    }

    return null;
  }

  buildInviteLink(merchantId: string, ref: string): string | null {
    const baseUrl = this.getInviteBaseUrl(merchantId);
    const normalizedRef = ref.trim();

    if (!baseUrl || !normalizedRef) {
      return null;
    }

    return `${baseUrl}${encodeURIComponent(normalizedRef)}`;
  }

  private readUrl(key: "MERCHANT_KE7STG_CALLBACK_URL" | "MERCHANT_KE7PROD_CALLBACK_URL"): string | null {
    const value = this.configService.get<string>(key) ?? process.env[key];
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private readInviteUrl(key: "MERCHANT_KE7STG_INVITE_URL" | "MERCHANT_KE7PROD_INVITE_URL"): string | null {
    const value = this.configService.get<string>(key) ?? process.env[key];
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }
}
