const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const AUTH_EXPIRED_FLAG = "authExpired";
let refreshPromise: Promise<string | null> | null = null;

type RefreshPayload = {
  accessToken: string;
  refreshToken: string;
};

type ToastType = "info" | "warning" | "error";

function createNetworkErrorResponse(message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

function getAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem("accessToken");
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem("refreshToken");
}

export function setTokens(tokens: RefreshPayload): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem("accessToken", tokens.accessToken);
  localStorage.setItem("refreshToken", tokens.refreshToken);
}

export function clearTokens(): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
}

function notifyToast(message: string, type: ToastType = "info"): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent("app-toast", { detail: { message, type } }));
}

function handleAuthExpired(): void {
  if (typeof window === "undefined") {
    return;
  }

  clearTokens();
  localStorage.setItem(AUTH_EXPIRED_FLAG, "1");
  notifyToast("Session expired. Please log in again.", "warning");
  window.dispatchEvent(new CustomEvent("auth-expired"));

  if (window.location.pathname !== "/") {
    window.location.href = "/?auth=expired";
  }
}

function notifyForbidden(path: string): void {
  if (typeof window === "undefined") {
    return;
  }

  notifyToast("You do not have permission to perform this action.", "error");
  window.dispatchEvent(new CustomEvent("api-forbidden", { detail: { path } }));
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    handleAuthExpired();
    return null;
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    notifyToast("Backend service is unavailable.", "error");
    return null;
  }

  if (!response.ok) {
    handleAuthExpired();
    return null;
  }

  const payload = (await response.json()) as RefreshPayload;
  if (!payload.accessToken || !payload.refreshToken) {
    handleAuthExpired();
    return null;
  }

  setTokens(payload);
  localStorage.removeItem(AUTH_EXPIRED_FLAG);
  return payload.accessToken;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function apiFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  const accessToken = getAccessToken();

  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
    });
  } catch {
    notifyToast("Backend service is unavailable.", "error");
    return createNetworkErrorResponse("Backend service is unavailable.");
  }

  if (response.status === 403) {
    notifyForbidden(path);
    return response;
  }

  if (response.status !== 401 || !retry) {
    return response;
  }

  const newAccessToken = await refreshAccessToken();
  if (!newAccessToken) {
    return response;
  }

  const retryHeaders = new Headers(init.headers ?? {});
  retryHeaders.set("Authorization", `Bearer ${newAccessToken}`);

  let retryResponse: Response;

  try {
    retryResponse = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: retryHeaders,
    });
  } catch {
    notifyToast("Backend service is unavailable.", "error");
    return createNetworkErrorResponse("Backend service is unavailable.");
  }

  if (retryResponse.status === 403) {
    notifyForbidden(path);
  }

  return retryResponse;
}
