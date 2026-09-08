export const PERMISSIONS = {
  ADMIN_ACCESS: "admin:access",
  DRAW_MANAGE: "draw:manage",
  LIVE_MANAGE: "live:manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type RoleName = "player" | "admin" | "super_admin";

export interface AuthUser {
  id: string;
  phone: string;
  role: RoleName;
  permissions: Permission[];
}

export interface JwtPayload {
  sub: string;
  phone: string;
  role: RoleName;
  permissions: Permission[];
}
