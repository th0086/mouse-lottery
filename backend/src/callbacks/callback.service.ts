import { Injectable, Logger } from "@nestjs/common";

export type CallbackResponse = {
  success?: boolean;
  actionId?: string;
  error?: boolean;
  message?: string;
  data?: {
    depositAmount?: string;
    betAmount?: string;
    betCount?: number;
  };
};

export type ActionNotificationResult = {
  ok: boolean;
  statusCode: number;
  message?: string;
};

const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class CallbackService {
  private readonly logger = new Logger(CallbackService.name);

  async postBetConfirmation(callbackUrl: string, token: string): Promise<CallbackResponse> {
    let lastResult: CallbackResponse = { error: true, message: "Callback failed" };

    for (let attempt = 1; attempt <= RETRY_COUNT; attempt += 1) {
      const result = await this.sendOnce(callbackUrl, token);
      lastResult = result;

      if (result.success === true && !result.error) {
        return result;
      }

      if (attempt < RETRY_COUNT) {
        await sleep(RETRY_DELAY_MS);
      }
    }

    return lastResult;
  }

  async postWinningNotification(callbackUrl: string, actionId: string): Promise<ActionNotificationResult> {
    return this.sendActionNotification(callbackUrl, actionId);
  }

  private async sendOnce(callbackUrl: string, token: string): Promise<CallbackResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        signal: controller.signal,
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      const parsed = this.parseResponse(payload);

      if (!response.ok) {
        return {
          ...parsed,
          error: true,
          message: parsed.message ?? `Callback HTTP ${response.status}`,
        };
      }

      return parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Callback request failed";
      this.logger.warn(`Callback request error: ${message}`);
      return { error: true, message };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async sendActionNotification(
    callbackUrl: string,
    actionId: string,
  ): Promise<ActionNotificationResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const normalizedCallbackUrl = callbackUrl.replace(/\/$/, "");
    const notificationUrl = `${normalizedCallbackUrl}/${encodeURIComponent(actionId)}`;

    try {
      const response = await fetch(notificationUrl, {
        method: "POST",
        signal: controller.signal,
      });

      if (response.status === 200) {
        return { ok: true, statusCode: response.status };
      }

      let bodyText = "";
      try {
        bodyText = (await response.text()).trim();
      } catch {
        bodyText = "";
      }

      return {
        ok: false,
        statusCode: response.status,
        message: bodyText || `Callback HTTP ${response.status}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Callback request failed";
      this.logger.warn(`Winning notification request error: ${message}`);
      return { ok: false, statusCode: 0, message };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseResponse(payload: unknown): CallbackResponse {
    if (!payload || typeof payload !== "object") {
      return { error: true, message: "Callback response is not valid JSON object" };
    }

    const source = payload as Record<string, unknown>;
    const sourceData =
      source.data && typeof source.data === "object"
        ? (source.data as Record<string, unknown>)
        : undefined;

    const depositAmountValue = sourceData?.depositAmount;
    const betAmountValue = sourceData?.betAmount;
    const betCountValue = sourceData?.betCount;

    const parsedBetCount =
      typeof betCountValue === "number" && Number.isFinite(betCountValue)
        ? betCountValue
        : typeof betCountValue === "string"
          ? Number(betCountValue)
          : undefined;

    return {
      success: typeof source.success === "boolean" ? source.success : undefined,
      actionId: typeof source.actionId === "string" ? source.actionId : undefined,
      error: typeof source.error === "boolean" ? source.error : undefined,
      message: typeof source.message === "string" ? source.message : undefined,
      data: sourceData
        ? {
            depositAmount:
              typeof depositAmountValue === "string"
                ? depositAmountValue
                : typeof depositAmountValue === "number" && Number.isFinite(depositAmountValue)
                  ? String(depositAmountValue)
                  : undefined,
            betAmount:
              typeof betAmountValue === "string"
                ? betAmountValue
                : typeof betAmountValue === "number" && Number.isFinite(betAmountValue)
                  ? String(betAmountValue)
                  : undefined,
            betCount:
              typeof parsedBetCount === "number" && Number.isFinite(parsedBetCount)
                ? parsedBetCount
                : undefined,
          }
        : undefined,
    };
  }
}
