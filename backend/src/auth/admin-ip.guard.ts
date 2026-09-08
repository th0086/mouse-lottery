import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";

const DEFAULT_ADMIN_ALLOWED_IP = "178.128.217.196";
const DEV_LOCAL_ALLOWED_IPS = ["127.0.0.1", "::1"];

function normalizeIp(ip: string | undefined): string | null {
  if (!ip) {
    return null;
  }

  const trimmed = ip.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("::ffff:")) {
    return trimmed.slice(7);
  }

  return trimmed;
}

function collectCandidateIps(req: Request): string[] {
  const candidates: string[] = [];
  const xForwardedFor = req.headers["x-forwarded-for"];
  const xRealIp = req.headers["x-real-ip"];

  if (typeof xForwardedFor === "string") {
    // Trust only the right-most hop appended by our reverse proxy.
    const parts = xForwardedFor.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
    const rightMost = parts.length > 0 ? parts[parts.length - 1] : undefined;
    const normalized = normalizeIp(rightMost);
    if (normalized) {
      candidates.push(normalized);
    }
  }

  if (typeof xRealIp === "string") {
    const normalized = normalizeIp(xRealIp);
    if (normalized) {
      candidates.push(normalized);
    }
  }

  const ipFromExpress = normalizeIp(req.ip);
  if (ipFromExpress) {
    candidates.push(ipFromExpress);
  }

  const ipFromSocket = normalizeIp(req.socket?.remoteAddress);
  if (ipFromSocket) {
    candidates.push(ipFromSocket);
  }

  return Array.from(new Set(candidates));
}

@Injectable()
export class AdminIpGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const candidateIps = collectCandidateIps(request);
    const allowList = this.getAllowList();

    if (candidateIps.some((ip) => allowList.includes(ip))) {
      return true;
    }

    throw new ForbiddenException("Admin access is restricted by IP allowlist.");
  }

  private getAllowList(): string[] {
    const configured = (this.configService.get<string>("ADMIN_IP_ALLOWLIST") ?? DEFAULT_ADMIN_ALLOWED_IP)
      .split(",")
      .map((value) => normalizeIp(value))
      .filter((value): value is string => !!value);

    const nodeEnv = (this.configService.get<string>("NODE_ENV") ?? "development").toLowerCase();
    if (nodeEnv !== "production") {
      return Array.from(new Set([...configured, ...DEV_LOCAL_ALLOWED_IPS]));
    }

    return Array.from(new Set(configured));
  }
}
