"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FreeBetsPill } from "../components/FreeBetsPill";
import { LiveYoutube } from "../components/LiveYoutube";
import { MobileNav } from "../components/MobileNav";
import { apiFetch, clearTokens, setTokens } from "../lib/apiClient";

type GameState = {
  youtubeVideoId: string;
  jackpot: { amount: number; currency: string };
  draw: {
    stream: { number: number; receivedAt: string }[];
    totalToday: number;
    dayKey: string;
    history: {
      dayKey: string;
      numbers: number[];
      total: number;
      lastReceivedAt: string;
    }[];
  };
  resultPolicy: {
    nonWinningTerminalStatus: string;
    payoutRemainderPolicy: string;
    realtimeMode: string;
    pollingIntervalSeconds: number;
    liveOverlayEnabled: boolean;
    otpEnabled: boolean;
  };
  updatedAt: string;
};

type AuthPayload = {
  user: {
    id: string;
    phone: string;
    role: string;
    permissions: string[];
    walletBalanceKES: number;
    walletCurrency: string;
    depositAmount: string;
    betAmount: string;
    dailyBetAllowanceTotal: number;
    dailyBetAllowanceUsed: number;
    dailyBetAllowanceRemaining: number;
  };
  accessToken: string;
  refreshToken: string;
};

type MeResponse = {
  id: string;
  phone: string;
  role: string;
  permissions: string[];
  authMethod: string;
  externalMerchant: string | null;
  externalRef: string | null;
  inviteLink: string | null;
  dailyLoginCompletedToday: boolean;
  inviteMissionCompletedToday: boolean;
  placeBetCompletedToday: boolean;
  turnover1000CompletedToday: boolean;
  deposit99CompletedToday: boolean;
  completeAllCompletedToday: boolean;
  dailyLoginReceivedToday: boolean;
  inviteMissionReceivedToday: boolean;
  placeBetReceivedToday: boolean;
  turnover1000ReceivedToday: boolean;
  deposit99ReceivedToday: boolean;
  completeAllReceivedToday: boolean;
  turnoverMissionThreshold: number;
  depositMissionThreshold: number;
  canAccessAdmin: boolean;
  canAccessData: boolean;
  walletBalanceKES: number;
  walletCurrency: string;
  depositAmount: string;
  betAmount: string;
  dailyBetAllowanceTotal: number;
  dailyBetAllowanceUsed: number;
  dailyBetAllowanceRemaining: number;
};

type TicketEntry = {
  id: string;
  numbers: number[];
  status: "Pending" | "Won" | "Expired" | "Unmatched" | "Voided";
  ruleVersion?: "legacy_time_window" | "draw_window_v2" | null;
  drawsSincePlaced?: number | null;
  numbersUntilExpiry?: number | null;
  validFromNumbersAfter?: number | null;
  expiresInNumbersAfter?: number | null;
  callbackStatus?: "pending" | "success" | "failed" | "abnormal" | null;
  callbackMessage?: string | null;
  payoutKES: number | null;
  placedAt: string;
  validFrom: string;
  expiresAt: string;
  settledAt: string | null;
  winningSequenceEndedAt: string | null;
  createdAt: string | null;
};

type WalletCredit = {
  id: string;
  entryId: string;
  settlementKey: string;
  jackpotBeforeSplitKES: number;
  winnerCount: number;
  payoutKES: number;
  settledAt: string;
  currency: string;
};

type ExternalRedirectParams = {
  merchant: string;
  token: string;
  phone: string;
  ref?: string;
};

type AnnouncementConfig = {
  enabled: boolean;
  content: string;
};

const STATE_POLLING_INTERVAL_MS = 2000;
const PROFILE_POLLING_INTERVAL_MS = 8000;
const ENTRIES_POLLING_INTERVAL_MS = 2000;
const ANNOUNCEMENT_POLLING_INTERVAL_MS = 10000;
const DRAW_STREAM_LARGE_DIGIT_CYCLE_MS = 500;
const DRAW_STREAM_LARGE_DIGIT_SCRAMBLE_STEP_MS = 50;
const DRAW_STREAM_LARGE_DIGIT_SCRAMBLE_STEPS = 6;
const SMALL_STREAM_DIGIT_BREATHE_MS = 100;
const SMALL_STREAM_DIGIT_GAP_MS = 500;
const SMALL_STREAM_DIGIT_STEP_MS = SMALL_STREAM_DIGIT_BREATHE_MS + SMALL_STREAM_DIGIT_GAP_MS;
const AUTH_EXPIRED_FLAG = "authExpired";
const LAST_LOGIN_PHONE_KEY = "lastLoginPhone";
const REMEMBER_LOGIN_PHONE_KEY = "rememberLoginPhone";
const MERCHANT_CONTEXT_KEY = "merchantContext";
const SESSION_STATE_CACHE_KEY = "mouse-lottery-state-cache";
const SESSION_ANNOUNCEMENT_CACHE_KEY = "mouse-lottery-announcement-cache";
const SESSION_ENTRIES_CACHE_KEY = "mouse-lottery-entries-cache";
const SESSION_WALLET_CREDITS_CACHE_KEY = "mouse-lottery-wallet-credits-cache";
const SESSION_ME_CACHE_KEY = "mouse-lottery-me-cache";
const SELECT_NUMBERS_LOADING_DELAY_MS = 120;
const INITIAL_LOAD_STALE_TTL_MS = 5 * 60 * 1000;

function normalizeKenyanPhone(phone: string): string {
  const value = phone.trim();
  if (/^\+254[71]\d{8}$/.test(value)) {
    return value;
  }
  if (/^0[71]\d{8}$/.test(value)) {
    return `+254${value.slice(1)}`;
  }
  return value;
}

function readSessionCache<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

function writeSessionCache<T>(key: string, value: T): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage write failures and keep the UI responsive.
  }
}

function readSessionCacheWithFreshness<T>(key: string, ttlMs: number): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as { value: T; cachedAt: number } | T;
    if (parsed && typeof parsed === "object" && "value" in parsed && "cachedAt" in parsed) {
      if (Date.now() - parsed.cachedAt > ttlMs) {
        sessionStorage.removeItem(key);
        return null;
      }
      return parsed.value as T;
    }

    return parsed as T;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

function writeSessionCacheWithTimestamp<T>(key: string, value: T): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    sessionStorage.setItem(key, JSON.stringify({ value, cachedAt: Date.now() }));
  } catch {
    // Ignore storage write failures and keep the UI responsive.
  }
}

export default function HomePage() {
  const [state, setState] = useState<GameState | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [authBootstrapComplete, setAuthBootstrapComplete] = useState(false);
  const [externalAuthLoading, setExternalAuthLoading] = useState(false);
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);
  const [canAccessData, setCanAccessData] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authMessage, setAuthMessage] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [rememberLoginPhone, setRememberLoginPhone] = useState(true);
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [entries, setEntries] = useState<TicketEntry[]>([]);
  const [walletCredits, setWalletCredits] = useState<WalletCredit[]>([]);
  const [playMessage, setPlayMessage] = useState("");
  const [betErrorModalMessage, setBetErrorModalMessage] = useState("");
  const [submittingEntry, setSubmittingEntry] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [ticketHistoryOpen, setTicketHistoryOpen] = useState(false);
  const [claimingMissionId, setClaimingMissionId] = useState<number | null>(null);
  const [externalRedirect, setExternalRedirect] = useState<ExternalRedirectParams | null>(null);
  const [announcement, setAnnouncement] = useState<AnnouncementConfig>({ enabled: false, content: "" });
  const [entriesLoadedOnce, setEntriesLoadedOnce] = useState(false);
  const [showSelectNumbersLoading, setShowSelectNumbersLoading] = useState(false);
  const [initialLoadHydrated, setInitialLoadHydrated] = useState(false);
  const [animatedJackpotAmount, setAnimatedJackpotAmount] = useState(0);
  const [jackpotAmountPulse, setJackpotAmountPulse] = useState(false);
  const [drawStreamVisibleCount, setDrawStreamVisibleCount] = useState(0);
  const [animatedLargeStreamDigit, setAnimatedLargeStreamDigit] = useState(0);
  const [activeSmallStreamDigitIndex, setActiveSmallStreamDigitIndex] = useState(-1);
  const hasSyncedExternalStatus = useRef(false);
  const hasSyncedDepositMission = useRef(false);
  const jackpotAnimationFrameRef = useRef<number | null>(null);
  const jackpotPulseTimeoutRef = useRef<number | null>(null);
  const animatedJackpotAmountRef = useRef(0);
  const drawStreamDigitsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cachedState = readSessionCacheWithFreshness<GameState>(SESSION_STATE_CACHE_KEY, INITIAL_LOAD_STALE_TTL_MS);
    if (cachedState) {
      setState(cachedState);
    }

    const cachedAnnouncement = readSessionCacheWithFreshness<AnnouncementConfig>(SESSION_ANNOUNCEMENT_CACHE_KEY, INITIAL_LOAD_STALE_TTL_MS);
    if (cachedAnnouncement) {
      setAnnouncement(cachedAnnouncement);
    }

    const cachedEntries = readSessionCacheWithFreshness<TicketEntry[]>(SESSION_ENTRIES_CACHE_KEY, INITIAL_LOAD_STALE_TTL_MS);
    if (cachedEntries) {
      setEntries(cachedEntries);
    }

    const cachedWalletCredits = readSessionCacheWithFreshness<WalletCredit[]>(SESSION_WALLET_CREDITS_CACHE_KEY, INITIAL_LOAD_STALE_TTL_MS);
    if (cachedWalletCredits) {
      setWalletCredits(cachedWalletCredits);
    }

    const hasAccessToken = typeof window !== "undefined" && Boolean(localStorage.getItem("accessToken"));
    const cachedMe = hasAccessToken
      ? readSessionCacheWithFreshness<MeResponse>(SESSION_ME_CACHE_KEY, INITIAL_LOAD_STALE_TTL_MS)
      : null;
    if (cachedMe) {
      setMe(cachedMe);
      setCanAccessAdmin(cachedMe.canAccessAdmin);
      setCanAccessData(cachedMe.canAccessData);
    }

    setInitialLoadHydrated(true);
  }, []);

  const persistMerchantContext = (context: ExternalRedirectParams | null) => {
    if (typeof window === "undefined") {
      return;
    }

    if (!context) {
      localStorage.removeItem(MERCHANT_CONTEXT_KEY);
      return;
    }

    localStorage.setItem(MERCHANT_CONTEXT_KEY, JSON.stringify(context));
  };

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const rememberPhone = localStorage.getItem(REMEMBER_LOGIN_PHONE_KEY);
        setRememberLoginPhone(rememberPhone !== "0");

        const savedMerchantContextRaw = localStorage.getItem(MERCHANT_CONTEXT_KEY);
        if (savedMerchantContextRaw) {
          try {
            const savedMerchantContext = JSON.parse(savedMerchantContextRaw) as ExternalRedirectParams;
            if (savedMerchantContext?.merchant) {
              setExternalRedirect(savedMerchantContext);
            }
          } catch {
            localStorage.removeItem(MERCHANT_CONTEXT_KEY);
          }
        }

        const params = new URLSearchParams(window.location.search);
        const merchant = params.get("merchant")?.trim() ?? "";
        const token = params.get("token")?.trim() ?? "";
        const externalPhone = params.get("phone")?.trim() ?? "";
        const externalRef = (params.get("ref") ?? params.get("crc") ?? "").trim();
        const hasExpiredQuery = params.get("auth") === "expired";
        const hasExpiredFlag = localStorage.getItem(AUTH_EXPIRED_FLAG) === "1";

        if ((hasExpiredQuery || hasExpiredFlag) && !merchant) {
          setAuthMessage("Session expired. Please log in again.");
          setAuthOpen(true);
          localStorage.removeItem(AUTH_EXPIRED_FLAG);
        }

        if (merchant) {
          setExternalAuthLoading(true);

          const externalContext = { merchant, token, phone: externalPhone, ref: externalRef || undefined };
          setExternalRedirect(externalContext);
          persistMerchantContext(externalContext);

          if (!token || !externalPhone) {
            setAuthMessage("External login parameters are incomplete.");
          } else {
            try {
              const response = await apiFetch("/api/auth/external-login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ merchant, token, phone: externalPhone, ref: externalRef || undefined }),
              });

              const payload = (await response.json()) as AuthPayload | { message?: string; error?: string };
              if (!response.ok || !("accessToken" in payload)) {
                const maybeError = payload as { message?: string; error?: string };
                const errorMessage = maybeError.error ?? maybeError.message ?? "External login failed";

                if (errorMessage.includes("Invalid merchant")) {
                  clearTokens();
                  persistMerchantContext(null);
                  setExternalRedirect(null);
                  setMe(null);
                  setCanAccessAdmin(false);
                  setCanAccessData(false);
                  setAuthMessage("Invalid merchant, redirecting to home.");
                  window.location.replace("/");
                  return;
                }

                setAuthMessage(errorMessage);
              } else {
                setTokens({
                  accessToken: payload.accessToken,
                  refreshToken: payload.refreshToken,
                });

                persistMerchantContext(externalContext);

                const meResponse = await apiFetch("/api/auth/me");
                if (meResponse.ok) {
                  const mePayload = (await meResponse.json()) as MeResponse;
                  localStorage.removeItem(AUTH_EXPIRED_FLAG);
                  setMe(mePayload);
                  setCanAccessAdmin(mePayload.canAccessAdmin);
                  setCanAccessData(mePayload.canAccessData);
                  writeSessionCacheWithTimestamp(SESSION_ME_CACHE_KEY, mePayload);
                  setAuthMessage("");
                  setAuthOpen(false);
                }
              }
            } catch {
              setAuthMessage("Unable to complete external login");
            }
          }
        }

        if (hasExpiredQuery || merchant || token || externalPhone || externalRef) {
          params.delete("auth");
          params.delete("merchant");
          params.delete("token");
          params.delete("phone");
          params.delete("ref");
          params.delete("crc");
          const next = params.toString();
          const url = next ? `/?${next}` : "/";
          window.history.replaceState({}, "", url);
        }
      } finally {
        if (mounted) {
          setExternalAuthLoading(false);
          setAuthBootstrapComplete(true);
        }
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const onForbidden = () => {
      setAuthMessage("You do not have permission to perform this action.");
    };

    window.addEventListener("api-forbidden", onForbidden);
    return () => window.removeEventListener("api-forbidden", onForbidden);
  }, []);

  useEffect(() => {
    let mounted = true;
    let inFlight = false;

    const fetchState = async () => {
      if (inFlight) {
        return;
      }

      inFlight = true;
      try {
        const res = await apiFetch("/api/game/state", { cache: "no-store" });
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as GameState;
        if (mounted) {
          setState(data);
          writeSessionCacheWithTimestamp(SESSION_STATE_CACHE_KEY, data);
        }
      } catch {
        // Keep previous data on transient network errors.
      } finally {
        inFlight = false;
      }
    };

    fetchState();
    const id = setInterval(fetchState, STATE_POLLING_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let inFlight = false;

    const loadMe = async () => {
      if (inFlight) {
        return;
      }

      inFlight = true;
      try {
      const token = localStorage.getItem("accessToken");
      if (!token) {
        setCanAccessAdmin(false);
        setCanAccessData(false);
        setMe(null);
        sessionStorage.removeItem(SESSION_ME_CACHE_KEY);
        return;
      }

        const response = await apiFetch("/api/auth/me");

        if (!response.ok) {
          setCanAccessAdmin(false);
          setCanAccessData(false);
          setMe(null);
          setAuthMessage("Your session has expired. Please log in again.");
          setAuthOpen(true);
          return;
        }

        const payload = (await response.json()) as MeResponse;
        localStorage.removeItem(AUTH_EXPIRED_FLAG);
        setMe(payload);
        setCanAccessAdmin(payload.canAccessAdmin);
        setCanAccessData(payload.canAccessData);
        writeSessionCacheWithTimestamp(SESSION_ME_CACHE_KEY, payload);
        setAuthMessage("");
        setAuthOpen(false);
      } catch {
        setCanAccessAdmin(false);
        setCanAccessData(false);
        setMe(null);
        setAuthMessage("Failed to load profile. Please log in again.");
        setAuthOpen(true);
      } finally {
        inFlight = false;
      }
    };

    void loadMe();
    const id = setInterval(() => {
      void loadMe();
    }, PROFILE_POLLING_INTERVAL_MS);

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let mounted = true;
    let inFlight = false;

    const loadEntriesAndCredits = async () => {
      if (inFlight) {
        return;
      }

      inFlight = true;
      try {
      const token = localStorage.getItem("accessToken");
      if (!token) {
        if (mounted) {
          setEntries([]);
          setWalletCredits([]);
          setEntriesLoadedOnce(true);
        }
        return;
      }

      const [entriesResponse, creditsResponse] = await Promise.all([
        apiFetch("/api/game/my-entries", { cache: "no-store" }),
        apiFetch("/api/game/my-wallet-credits", { cache: "no-store" }),
      ]);

      if (entriesResponse.ok) {
        const entryPayload = (await entriesResponse.json()) as TicketEntry[];
        if (mounted) {
          setEntries(entryPayload);
          writeSessionCacheWithTimestamp(SESSION_ENTRIES_CACHE_KEY, entryPayload);
        }
      }

      if (creditsResponse.ok) {
        const creditsPayload = (await creditsResponse.json()) as WalletCredit[];
        if (mounted) {
          setWalletCredits(creditsPayload);
          writeSessionCacheWithTimestamp(SESSION_WALLET_CREDITS_CACHE_KEY, creditsPayload);
        }
      }
      } catch {
        // Keep previous data on transient network errors.
      } finally {
        if (mounted) {
          setEntriesLoadedOnce(true);
        }
        inFlight = false;
      }
    };

    void loadEntriesAndCredits();
    const id = setInterval(() => {
      void loadEntriesAndCredits();
    }, ENTRIES_POLLING_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [me?.id]);

  useEffect(() => {
    if (!externalRedirect?.merchant) {
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token || hasSyncedExternalStatus.current) {
      return;
    }

    hasSyncedExternalStatus.current = true;

    const syncExternalStatus = async () => {
      const response = await apiFetch("/api/auth/sync-external-status", {
        method: "POST",
      });

      if (!response.ok) {
        return;
      }

      const meResponse = await apiFetch("/api/auth/me", { cache: "no-store" });
      if (!meResponse.ok) {
        return;
      }

      const mePayload = (await meResponse.json()) as MeResponse;
      setMe(mePayload);
      setCanAccessAdmin(mePayload.canAccessAdmin);
      setCanAccessData(mePayload.canAccessData);
      writeSessionCacheWithTimestamp(SESSION_ME_CACHE_KEY, mePayload);
    };

    void syncExternalStatus();
  }, [externalRedirect?.merchant, me?.id]);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token || !authBootstrapComplete) {
      hasSyncedDepositMission.current = false;
      return;
    }

    if (hasSyncedDepositMission.current) {
      return;
    }

    hasSyncedDepositMission.current = true;

    const syncDepositMission = async () => {
      try {
        const response = await apiFetch("/api/auth/refresh-missions", {
          method: "GET",
        });

        if (!response.ok) {
          return;
        }

        const mePayload = (await response.json()) as MeResponse;
        setMe(mePayload);
        setCanAccessAdmin(mePayload.canAccessAdmin);
        setCanAccessData(mePayload.canAccessData);
        writeSessionCacheWithTimestamp(SESSION_ME_CACHE_KEY, mePayload);
      } catch {
        // Silently fail - the main /api/auth/me endpoint will still update the user data
      }
    };

    void syncDepositMission();
  }, [authBootstrapComplete]);

  const handleAuthModalClose = () => {
    setAuthOpen(false);
    setAuthMessage("");
  };

  useEffect(() => {
    let mounted = true;
    let inFlight = false;

    const fetchAnnouncement = async () => {
      if (inFlight) {
        return;
      }

      inFlight = true;
      try {
        const response = await apiFetch("/api/announcement", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as Partial<AnnouncementConfig>;
        if (!mounted) {
          return;
        }

        const nextAnnouncement = {
          enabled: Boolean(payload.enabled),
          content: typeof payload.content === "string" ? payload.content : "",
        };

        setAnnouncement(nextAnnouncement);
        writeSessionCacheWithTimestamp(SESSION_ANNOUNCEMENT_CACHE_KEY, nextAnnouncement);
      } finally {
        inFlight = false;
      }
    };

    void fetchAnnouncement();
    const id = setInterval(() => {
      void fetchAnnouncement();
    }, ANNOUNCEMENT_POLLING_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const onSubmitAuth = async () => {
    setAuthMessage("");
    try {
      const normalizedPhone = normalizeKenyanPhone(phone);
      const endpoint = authMode === "login" ? "login" : "register";
      const response = await apiFetch(`/api/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone, password }),
      });

      const payload = (await response.json()) as AuthPayload | { message?: string };
      if (!response.ok || !("accessToken" in payload)) {
        const maybeError = payload as { message?: string };
        setAuthMessage(maybeError.message ?? "Authentication failed");
        return;
      }

      setTokens({
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
      });

      const meResponse = await apiFetch("/api/auth/me");

      if (!meResponse.ok) {
        setAuthMessage("Signed in, but failed to load profile");
        return;
      }

      const mePayload = (await meResponse.json()) as MeResponse;
      setMe(mePayload);
      setCanAccessAdmin(mePayload.canAccessAdmin);
      setCanAccessData(mePayload.canAccessData);
      writeSessionCacheWithTimestamp(SESSION_ME_CACHE_KEY, mePayload);
      if (authMode === "login") {
        if (rememberLoginPhone) {
          localStorage.setItem(LAST_LOGIN_PHONE_KEY, mePayload.phone);
        } else {
          localStorage.removeItem(LAST_LOGIN_PHONE_KEY);
        }
      }
      setAuthMessage(`${authMode === "login" ? "Logged in" : "Registered"} as ${mePayload.phone}`);
      setAuthOpen(false);
    } catch {
      setAuthMessage("Unable to reach auth service");
    }
  };

  const logout = () => {
    clearTokens();
    persistMerchantContext(null);
    setExternalRedirect(null);
    hasSyncedExternalStatus.current = false;
    sessionStorage.removeItem(SESSION_ME_CACHE_KEY);
    setCanAccessAdmin(false);
    setCanAccessData(false);
    setMe(null);
    setAuthMessage("Logged out");
  };

  const openAuthModal = (mode: "login" | "register") => {
    const rememberPhone = localStorage.getItem(REMEMBER_LOGIN_PHONE_KEY) !== "0";
    const lastLoginPhone = localStorage.getItem(LAST_LOGIN_PHONE_KEY) ?? "";
    setRememberLoginPhone(rememberPhone);
    setAuthMode(mode);
    setPhone(mode === "login" && rememberPhone ? lastLoginPhone : "");
    setPassword("");
    setAuthMessage("");
    setAuthOpen(true);
  };

  const onToggleRememberLoginPhone = (checked: boolean) => {
    setRememberLoginPhone(checked);
    localStorage.setItem(REMEMBER_LOGIN_PHONE_KEY, checked ? "1" : "0");
    if (!checked) {
      localStorage.removeItem(LAST_LOGIN_PHONE_KEY);
    }
  };

  const jackpotCurrency = state?.jackpot.currency ?? "KES";
  const jackpotTargetAmount = state?.jackpot.amount ?? 0;

  useEffect(() => {
    if (jackpotAnimationFrameRef.current !== null) {
      cancelAnimationFrame(jackpotAnimationFrameRef.current);
    }

    const startValue = animatedJackpotAmountRef.current;
    const endValue = jackpotTargetAmount;

    if (Math.abs(endValue - startValue) < 1) {
      animatedJackpotAmountRef.current = endValue;
      setAnimatedJackpotAmount(endValue);
      return;
    }

    const durationMs = 820;
    let animationStartMs: number | null = null;

    const tick = (timestampMs: number) => {
      if (animationStartMs === null) {
        animationStartMs = timestampMs;
      }

      const elapsedMs = timestampMs - animationStartMs;
      const progress = Math.min(elapsedMs / durationMs, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const nextValue = startValue + (endValue - startValue) * easedProgress;

      animatedJackpotAmountRef.current = nextValue;
      setAnimatedJackpotAmount(nextValue);

      if (progress < 1) {
        jackpotAnimationFrameRef.current = requestAnimationFrame(tick);
      } else {
        jackpotAnimationFrameRef.current = null;
      }
    };

    jackpotAnimationFrameRef.current = requestAnimationFrame(tick);

    setJackpotAmountPulse(true);
    if (jackpotPulseTimeoutRef.current !== null) {
      window.clearTimeout(jackpotPulseTimeoutRef.current);
    }
    jackpotPulseTimeoutRef.current = window.setTimeout(() => {
      setJackpotAmountPulse(false);
      jackpotPulseTimeoutRef.current = null;
    }, 500);

    return () => {
      if (jackpotAnimationFrameRef.current !== null) {
        cancelAnimationFrame(jackpotAnimationFrameRef.current);
        jackpotAnimationFrameRef.current = null;
      }
    };
  }, [jackpotTargetAmount]);

  useEffect(() => {
    return () => {
      if (jackpotAnimationFrameRef.current !== null) {
        cancelAnimationFrame(jackpotAnimationFrameRef.current);
      }
      if (jackpotPulseTimeoutRef.current !== null) {
        window.clearTimeout(jackpotPulseTimeoutRef.current);
      }
    };
  }, []);

  const formattedJackpotAmount = useMemo(() => {
    const amount = Math.max(0, Math.round(animatedJackpotAmount));
    return new Intl.NumberFormat("en-US").format(amount);
  }, [animatedJackpotAmount]);

  const formattedWallet = useMemo(() => {
    if (!me) {
      return "KES 0";
    }

    return `${me.walletCurrency} ${new Intl.NumberFormat("en-US").format(me.walletBalanceKES)}`;
  }, [me]);

  const isBettingLocked = announcement.enabled;
  const displayDepositAmount = me?.depositAmount?.trim() || "0.00";
  const displayBetAmount = me?.betAmount?.trim() || "0.00";
  const dailyBetAllowanceTotal = me?.dailyBetAllowanceTotal ?? 0;
  const dailyBetAllowanceUsed = me?.dailyBetAllowanceUsed ?? 0;
  const dailyBetAllowanceRemaining = me?.dailyBetAllowanceRemaining ?? 0;

  const toggleNumber = (value: number) => {
    if (isBettingLocked) {
      return;
    }

    setSelectedNumbers((current) => {
      if (current.length >= 4) {
        return current;
      }
      return [...current, value];
    });
  };

  const clearNumbers = () => {
    if (isBettingLocked) {
      return;
    }

    setSelectedNumbers([]);
  };

  const confirmNumbers = async () => {
    if (isBettingLocked) {
      setPlayMessage("Betting is temporarily unavailable due to an active announcement.");
      return;
    }

    if (!me) {
      setPlayMessage("Please log in to submit your numbers.");
      openAuthModal("login");
      return;
    }

    if (selectedNumbers.length !== 4) {
      setPlayMessage("Select exactly 4 numbers before confirming.");
      return;
    }

    setSubmittingEntry(true);
    setPlayMessage("");

    const response = await apiFetch("/api/game/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numbers: selectedNumbers }),
    });

    const payload = (await response.json()) as
      | {
          id: string;
          numbers: number[];
          status: string;
          ruleVersion?: "legacy_time_window" | "draw_window_v2";
          drawsSincePlaced?: number | null;
          numbersUntilExpiry?: number | null;
          validFromNumbersAfter?: number | null;
          expiresInNumbersAfter?: number | null;
          placedAt: string;
          validFrom: string;
          expiresAt: string;
        }
      | { message?: string };

    if (!response.ok || !("id" in payload)) {
      const maybeError = payload as { message?: string };
      const errorMessage = maybeError.message ?? "Failed to submit numbers.";
      if (errorMessage.includes("No remaining daily bet chances") || errorMessage.includes("No remaining daily chances")) {
        setBetErrorModalMessage(errorMessage);
      } else {
        setPlayMessage(errorMessage);
      }
      setSubmittingEntry(false);
      return;
    }

    const optimisticEntry: TicketEntry = {
      id: payload.id,
      numbers: payload.numbers,
      status: (payload.status as TicketEntry["status"]) ?? "Pending",
      ruleVersion: payload.ruleVersion ?? null,
      drawsSincePlaced: payload.drawsSincePlaced ?? null,
      numbersUntilExpiry: payload.numbersUntilExpiry ?? null,
      validFromNumbersAfter: payload.validFromNumbersAfter ?? null,
      expiresInNumbersAfter: payload.expiresInNumbersAfter ?? null,
      callbackStatus: null,
      callbackMessage: null,
      payoutKES: null,
      placedAt: payload.placedAt,
      validFrom: payload.validFrom,
      expiresAt: payload.expiresAt,
      settledAt: null,
      winningSequenceEndedAt: null,
      createdAt: payload.placedAt,
    };

    setEntries((current) => [optimisticEntry, ...current].slice(0, 20));
    setPlayMessage(
      `Ticket submitted: ${payload.numbers.join("-")}. Valid from 4 numbers after · Unmatched 53 numbers after.`,
    );
    setSelectedNumbers([]);
    setSubmittingEntry(false);

    void apiFetch("/api/game/my-entries", { cache: "no-store" })
      .then(async (refreshResponse) => {
        if (!refreshResponse.ok) {
          return;
        }

        const refreshed = (await refreshResponse.json()) as TicketEntry[];
        setEntries(refreshed.slice(0, 20));
      })
      .catch(() => undefined);
  };

  const streamNumbers = state?.draw.stream ?? [];
  const todayTotal = state?.draw.totalToday ?? 0;
  const dayKey = state?.draw.dayKey ?? "";
  const drawHistory = state?.draw.history ?? [];
  const latestFourNumbers = streamNumbers.slice(-4);
  const visibleStreamNumbers = drawStreamVisibleCount > 0
    ? streamNumbers.slice(-drawStreamVisibleCount)
    : streamNumbers;
  const latestFourNumbersOnly = latestFourNumbers.map((item) => item.number);
  const hideTopbarActions = Boolean(externalRedirect?.merchant);

  useEffect(() => {
    if (visibleStreamNumbers.length === 0) {
      setActiveSmallStreamDigitIndex(-1);
      return;
    }

    let cancelled = false;
    let currentIndex = 0;
    let nextPulseIntervalId: number | null = null;
    let clearActiveTimeoutId: number | null = null;

    const pulseNextDigit = () => {
      const activeIndex = currentIndex;
      setActiveSmallStreamDigitIndex(activeIndex);

      if (clearActiveTimeoutId !== null) {
        window.clearTimeout(clearActiveTimeoutId);
      }

      clearActiveTimeoutId = window.setTimeout(() => {
        if (!cancelled) {
          setActiveSmallStreamDigitIndex((index) => (index === activeIndex ? -1 : index));
        }
      }, SMALL_STREAM_DIGIT_BREATHE_MS);

      currentIndex = (currentIndex + 1) % visibleStreamNumbers.length;
    };

    pulseNextDigit();
    nextPulseIntervalId = window.setInterval(pulseNextDigit, SMALL_STREAM_DIGIT_STEP_MS);

    return () => {
      cancelled = true;
      if (nextPulseIntervalId !== null) {
        window.clearInterval(nextPulseIntervalId);
      }
      if (clearActiveTimeoutId !== null) {
        window.clearTimeout(clearActiveTimeoutId);
      }
    };
  }, [visibleStreamNumbers.length]);

  useEffect(() => {
    let cancelled = false;
    let cycleTimeoutId: number | null = null;
    let scrambleIntervalId: number | null = null;

    const randomDigit = () => Math.floor(Math.random() * 10);

    const clearActiveTimers = () => {
      if (cycleTimeoutId !== null) {
        window.clearTimeout(cycleTimeoutId);
        cycleTimeoutId = null;
      }
      if (scrambleIntervalId !== null) {
        window.clearInterval(scrambleIntervalId);
        scrambleIntervalId = null;
      }
    };

    const runCycle = () => {
      let step = 0;
      scrambleIntervalId = window.setInterval(() => {
        if (cancelled) {
          clearActiveTimers();
          return;
        }

        step += 1;
        setAnimatedLargeStreamDigit(randomDigit());

        if (step < DRAW_STREAM_LARGE_DIGIT_SCRAMBLE_STEPS) {
          return;
        }

        if (scrambleIntervalId !== null) {
          window.clearInterval(scrambleIntervalId);
          scrambleIntervalId = null;
        }

        setAnimatedLargeStreamDigit(randomDigit());

        const pauseMs = Math.max(
          0,
          DRAW_STREAM_LARGE_DIGIT_CYCLE_MS
            - DRAW_STREAM_LARGE_DIGIT_SCRAMBLE_STEP_MS * DRAW_STREAM_LARGE_DIGIT_SCRAMBLE_STEPS,
        );
        cycleTimeoutId = window.setTimeout(() => {
          if (!cancelled) {
            runCycle();
          }
        }, pauseMs);
      }, DRAW_STREAM_LARGE_DIGIT_SCRAMBLE_STEP_MS);
    };

    runCycle();

    return () => {
      cancelled = true;
      clearActiveTimers();
    };
  }, []);

  useEffect(() => {
    const el = drawStreamDigitsRef.current;
    if (!el) {
      setDrawStreamVisibleCount(streamNumbers.length);
      return;
    }

    const updateVisibleCount = () => {
      const styles = window.getComputedStyle(el);
      const gap = Number.parseFloat(styles.gap || "8") || 8;
      const paddingLeft = Number.parseFloat(styles.paddingLeft || "0") || 0;
      const paddingRight = Number.parseFloat(styles.paddingRight || "0") || 0;
      const sampleBall = el.querySelector<HTMLElement>(".stream-digit-pill");
      const ballWidth = sampleBall?.getBoundingClientRect().width ?? 54;
      const usableWidth = Math.max(0, el.clientWidth - paddingLeft - paddingRight);
      const maxVisible = Math.max(1, Math.floor((usableWidth + gap) / (ballWidth + gap)));
      setDrawStreamVisibleCount(Math.min(streamNumbers.length, maxVisible));
    };

    updateVisibleCount();
    const resizeObserver = new ResizeObserver(updateVisibleCount);
    resizeObserver.observe(el);
    window.addEventListener("resize", updateVisibleCount);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateVisibleCount);
    };
  }, [streamNumbers.length]);

  useEffect(() => {
    if (!initialLoadHydrated) {
      return;
    }

    if (!me || entriesLoadedOnce || entries.length > 0 || walletCredits.length > 0) {
      setShowSelectNumbersLoading(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowSelectNumbersLoading(true);
    }, SELECT_NUMBERS_LOADING_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [initialLoadHydrated, entriesLoadedOnce, entries.length, walletCredits.length, me]);

  const isSelectNumbersPanelLoading = showSelectNumbersLoading;

  const getEntryDisplayStatus = (entry: TicketEntry): "Pending" | "Won" | "Expired" | "Unmatched" | "Voided" | "Abnormal" => {
    if (entry.callbackStatus === "abnormal") {
      return "Abnormal";
    }
    if (entry.status === "Expired" && entry.ruleVersion === "draw_window_v2") {
      return "Unmatched";
    }
    return entry.status;
  };

  const getEntryStatusClassName = (entry: TicketEntry): string => {
    const displayStatus = getEntryDisplayStatus(entry).toLowerCase();
    return `entry-status entry-${displayStatus}`;
  };

  const renderNumberBalls = (numbers: number[], className = "entry-number-balls") => (
    <div className={className} aria-label={numbers.join("-")}>
      {numbers.map((number, index) => (
        <span key={`${number}-${index}`} className="entry-number-ball">
          {number}
        </span>
      ))}
    </div>
  );

  const getAbnormalDescription = (entry: TicketEntry): string => {
    const callbackMessage = entry.callbackMessage?.trim();
    if (callbackMessage && callbackMessage.length > 0) {
      return callbackMessage;
    }

    return "Please log in again.";
  };

  const getPendingWindowDescription = (entry: TicketEntry): string => {
    if (entry.ruleVersion === "draw_window_v2") {
      const validFromAfter = entry.validFromNumbersAfter ?? 4;
      const expiresAfter = Math.max(0, entry.numbersUntilExpiry ?? entry.expiresInNumbersAfter ?? 53);
      return `Valid from ${validFromAfter} numbers after · Unmatched ${expiresAfter} numbers after`;
    }
    return `Valid from ${new Date(entry.validFrom).toLocaleTimeString("en-KE", { timeZone: "Africa/Nairobi" })} · expires 23:59`;
  };

  const getUnmatchedNumbersAfterDescription = (entry: TicketEntry): string => {
    if (entry.ruleVersion !== "draw_window_v2") {
      return "Unmatched -- numbers after";
    }

    const expiresAfter = Math.max(0, entry.numbersUntilExpiry ?? entry.expiresInNumbersAfter ?? 53);
    return `Unmatched ${expiresAfter} numbers after`;
  };

  const getEntryLastStatusChangedAtDescription = (entry: TicketEntry): string => {
    const lastChangedAt = entry.winningSequenceEndedAt ?? entry.settledAt ?? entry.createdAt ?? entry.placedAt;

    if (!lastChangedAt) {
      return "Updated time unavailable";
    }

    return `Updated ${new Date(lastChangedAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}`;
  };

  const getLiveTicketDetailDescription = (entry: TicketEntry): string => {
    const displayStatus = getEntryDisplayStatus(entry);

    if (displayStatus === "Pending") {
      return getUnmatchedNumbersAfterDescription(entry);
    }

    if (displayStatus === "Abnormal") {
      return getAbnormalDescription(entry);
    }

    return getEntryLastStatusChangedAtDescription(entry);
  };

  const liveTicketItems = entries.slice(0, 6).map((entry) => ({
    id: entry.id,
    numbers: entry.numbers,
    status: getEntryDisplayStatus(entry),
    detailText: getLiveTicketDetailDescription(entry),
  }));
  const activeTicketEntries = entries.slice(0, 30);

  const turnoverMissionThreshold = me?.turnoverMissionThreshold ?? 1000;
  const depositMissionThreshold = me?.depositMissionThreshold ?? 99;

  const dailyMissions = [
    { id: 1, titleLines: ["Daily Login"] },
    { id: 4, titleLines: ["Place 1 Casino Bet", "or Sports Bet"] },
    { id: 2, titleLines: ["Invite a Friend"], highlight: true },
    { id: 5, titleLines: [`Complete ${new Intl.NumberFormat("en-US").format(turnoverMissionThreshold)}`, "Turnover"] },
    { id: 3, titleLines: [`Deposit ${new Intl.NumberFormat("en-US").format(depositMissionThreshold)} KES`] },
    { id: 6, titleLines: ["Complete All", "Missions"] },
  ];

  const getMissionCompletionStatus = (missionId: number): boolean => {
    if (!me) {
      return false;
    }

    if (missionId === 1) {
      return Boolean(me.dailyLoginCompletedToday);
    }

    if (missionId === 2) {
      return Boolean(me.inviteMissionCompletedToday);
    }

    if (missionId === 3) {
      return Boolean(me.deposit99CompletedToday);
    }

    if (missionId === 4) {
      return Boolean(me.placeBetCompletedToday);
    }

    if (missionId === 5) {
      return Boolean(me.turnover1000CompletedToday);
    }

    if (missionId === 6) {
      return Boolean(me.completeAllCompletedToday);
    }

    return false;
  };

  const getMissionReceivedStatus = (missionId: number): boolean => {
    if (!me) {
      return false;
    }

    if (missionId === 1) {
      return Boolean(me.dailyLoginReceivedToday);
    }

    if (missionId === 2) {
      return Boolean(me.inviteMissionReceivedToday);
    }

    if (missionId === 3) {
      return Boolean(me.deposit99ReceivedToday);
    }

    if (missionId === 4) {
      return Boolean(me.placeBetReceivedToday);
    }

    if (missionId === 5) {
      return Boolean(me.turnover1000ReceivedToday);
    }

    if (missionId === 6) {
      return Boolean(me.completeAllReceivedToday);
    }

    return false;
  };

  const triggerMissionHint = (missionId: number) => {
    if (missionId === 2) {
      const inviteSection = document.getElementById("invite-mission");
      inviteSection?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.dispatchEvent(new CustomEvent("app-toast", { detail: { message: "Invite your friend with the link below to complete this mission.", type: "info" } }));
      return;
    }

    if (missionId === 3 || missionId === 4 || missionId === 5) {
      const selectNumbersSection = document.getElementById("select-numbers");
      selectNumbersSection?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.dispatchEvent(new CustomEvent("app-toast", { detail: { message: "Complete this mission requirement, then come back to receive your reward.", type: "info" } }));
      return;
    }

    window.dispatchEvent(new CustomEvent("app-toast", { detail: { message: "Complete this mission requirement first, then tap Receive!", type: "info" } }));
  };

  const handleMissionButtonClick = (missionId: number, isReceiveAvailable: boolean) => {
    if (!me) {
      openAuthModal("login");
      return;
    }

    if (isReceiveAvailable) {
      void claimMission(missionId);
      return;
    }

    triggerMissionHint(missionId);
  };

  const handleJumpToDailyMissions = () => {
    const missionsSection = document.getElementById("daily-missions");
    missionsSection?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const claimMission = async (missionId: number) => {
    if (!me || claimingMissionId !== null) {
      return;
    }

    const isCompleted = getMissionCompletionStatus(missionId);
    const isReceived = getMissionReceivedStatus(missionId);
    if (!isCompleted || isReceived) {
      return;
    }

    setClaimingMissionId(missionId);
    try {
      const response = await apiFetch("/api/auth/missions/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId }),
      });

      const payload = (await response.json()) as { success?: boolean; message?: string };
      if (!response.ok || !payload.success) {
        const message = payload.message ?? "Failed to receive mission reward.";
        window.dispatchEvent(new CustomEvent("app-toast", { detail: { message, type: "warning" } }));
        return;
      }

      const meResponse = await apiFetch("/api/auth/me", { cache: "no-store" });
      if (meResponse.ok) {
        const mePayload = (await meResponse.json()) as MeResponse;
        setMe(mePayload);
        setCanAccessAdmin(mePayload.canAccessAdmin);
        setCanAccessData(mePayload.canAccessData);
      }

      window.dispatchEvent(new CustomEvent("app-toast", { detail: { message: "Mission reward received.", type: "info" } }));
    } catch {
      window.dispatchEvent(new CustomEvent("app-toast", { detail: { message: "Failed to receive mission reward.", type: "error" } }));
    } finally {
      setClaimingMissionId(null);
    }
  };

  const inviteLink = me?.inviteLink?.trim() ?? "";
  const inviteLinkDisplay =
    inviteLink || (externalAuthLoading ? "Loading invite link..." : "Invite link unavailable");

  const copyInviteLink = async () => {
    if (!inviteLink) {
      window.dispatchEvent(new CustomEvent("app-toast", { detail: { message: "Invite link unavailable.", type: "warning" } }));
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteLink);
      window.dispatchEvent(new CustomEvent("app-toast", { detail: { message: "Invite link copied.", type: "info" } }));
    } catch {
      window.dispatchEvent(new CustomEvent("app-toast", { detail: { message: "Unable to copy invite link.", type: "error" } }));
    }
  };

  return (
    <main className="page page-dark">
      <header className={`topbar ${hideTopbarActions ? "topbar-merchant" : ""}`}>
        <img src="/logo.png" alt="Hamster Spin" className="topbar-logo" />
        <span className="topbar-title">Hamster Spin</span>
        <div className="actions">
          <a className="btn btn-rules" href="/rules">
            View Full Rules ➔
          </a>
          {!hideTopbarActions ? (
            <>
              {!me ? (
                <>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => {
                      openAuthModal("login");
                    }}
                  >
                    Log In
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      openAuthModal("register");
                    }}
                  >
                    Sign Up
                  </button>
                </>
              ) : null}
              {me ? (
                <div className="user-session">
                  <span className="user-phone">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                    {me.phone}
                  </span>
                  <span className="wallet-badge">Wallet: {formattedWallet}</span>
                  <button type="button" className="btn btn-outline" onClick={logout}>Log Out</button>
                </div>
              ) : null}
              {canAccessAdmin ? <a className="btn btn-outline" href="/admin">Admin</a> : null}
              {canAccessData ? <a className="btn btn-outline" href="/data">Data</a> : null}
            </>
          ) : null}
        </div>
      </header>

      {authOpen ? (
        <div className="auth-modal-backdrop" onClick={handleAuthModalClose}>
          <section className="auth-modal" onClick={(event) => event.stopPropagation()}>
            <h2>{authMode === "login" ? "Log In" : "Sign Up"}</h2>
            <div className="auth-form">
              <input
                placeholder="+2547XXXXXXXX or 07XXXXXXXX"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                onBlur={() => setPhone(normalizeKenyanPhone(phone))}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {authMode === "login" ? (
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={rememberLoginPhone}
                    onChange={(event) => onToggleRememberLoginPhone(event.target.checked)}
                  />
                  Remember my phone
                </label>
              ) : null}
              <button type="button" className="btn btn-primary" onClick={onSubmitAuth}>
                {authMode === "login" ? "Log In" : "Sign Up"}
              </button>
            </div>
            {authMessage ? <p className="auth-message">{authMessage}</p> : null}
          </section>
        </div>
      ) : null}

      {betErrorModalMessage ? (
        <div className="auth-modal-backdrop" onClick={() => setBetErrorModalMessage("")}>
          <section className="auth-modal" onClick={(event) => event.stopPropagation()}>
            <h2>Betting Chance Limit</h2>
            <p className="auth-message">{betErrorModalMessage}</p>
            <div className="bet-error-modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => setBetErrorModalMessage("")}>OK</button>
            </div>
          </section>
        </div>
      ) : null}

      <section className="banner-layer" aria-label="Promotional banner">
        <div className="banner-slogan-layer" aria-hidden="true">
          <img
            src="/fuck_the_odds.png"
            alt=""
            className="banner-slogan-image banner-slogan-image-top"
          />
          <img
            src="/trust_the_mouse.png"
            alt=""
            className="banner-slogan-image banner-slogan-image-bottom"
          />
        </div>
        <picture className="banner-layer-picture">
          <source media="(max-width: 700px)" srcSet="/m_banner.png" />
          <img src="/banner.png" alt="Hamster Spin banner" className="banner-layer-image" />
        </picture>
        <button
          type="button"
          className="banner-missions-cta breathe"
          onClick={handleJumpToDailyMissions}
        >
          <span className="banner-missions-cta-label">
            Claim Coupons
            <br />
            Play for Free ➔
          </span>
        </button>
        <div className="banner-jackpot-layer" aria-live="polite" aria-label="Current jackpot amount">
          <p
            className={`band-amount banner-jackpot-amount ${jackpotAmountPulse ? "band-amount-live" : ""}`}
            data-amount={`${jackpotCurrency} ${formattedJackpotAmount}`}
          >
            {jackpotCurrency} {formattedJackpotAmount}
          </p>
        </div>
      </section>

      <section className="panel drawn-panel">
        <div className="drawn-layout">
          <article className="draw-stream-card">
            <div className="draw-stream-card-header">
              <h2>Today&apos;s Draw Stream {dayKey ? `(${dayKey})` : ""}</h2>
              <span className="draw-stream-count">{todayTotal} numbers today</span>
            </div>
            <div className="draw-stream-digits-row">
              <button
                type="button"
                className="draw-stream-history-chip"
                onClick={() => setHistoryOpen(true)}
                aria-label="Open draw history"
              >
                ◀
              </button>
              <div className="draw-stream-digits" ref={drawStreamDigitsRef} aria-live="polite" aria-label="Today draw numbers">
                {visibleStreamNumbers.map((item, index) => (
                  <span
                    key={`${item.receivedAt}`}
                    className={`stream-digit-pill stream-digit-pill-seq-breathe${index === activeSmallStreamDigitIndex ? " stream-digit-pill-seq-breathe-active" : ""}`}
                  >
                    {item.number}
                  </span>
                ))}
                {streamNumbers.length === 0 ? <span className="draw-stream-empty">No numbers received yet today.</span> : null}
              </div>
              <span className="stream-digit-pill stream-digit-pill-fixed stream-digit-pill-fixed-breathe">{animatedLargeStreamDigit}</span>
            </div>
          </article>

          <aside className="current-winning-card">
            <div className="current-winning-header">
              <h3>
                <span className="current-winning-title-main">Current</span>
                <span className="current-winning-title-sub">Winning Number</span>
              </h3>
              <button type="button" className="btn btn-outline current-winning-history-btn" onClick={() => setHistoryOpen(true)}>
                HISTORY
              </button>
            </div>
            <div className="current-winning-digits" aria-live="polite" aria-label="Latest four winning numbers">
              {latestFourNumbers.map((item) => (
                <span key={`draw-${item.receivedAt}`} className="current-winning-pill">{item.number}</span>
              ))}
              {latestFourNumbersOnly.length === 0 ? <span className="draw-stream-empty">Latest 4 numbers will appear here.</span> : null}
            </div>
          </aside>
        </div>
      </section>

      <LiveYoutube
        videoId={state?.youtubeVideoId}
        overlayEnabled={state?.resultPolicy.liveOverlayEnabled ?? false}
        latestNumber={streamNumbers.length > 0 ? streamNumbers[streamNumbers.length - 1].number : undefined}
        announcementEnabled={announcement.enabled}
        announcementContent={announcement.content}
        todayTotal={todayTotal}
        freeBetsCount={dailyBetAllowanceRemaining}
        ticketItems={liveTicketItems}
        isTicketLoading={isSelectNumbersPanelLoading}
        onOpenTicketHistory={() => setTicketHistoryOpen(true)}
        inviteLinkDisplay={inviteLinkDisplay}
        onCopyInviteLink={copyInviteLink}
      />

      {historyOpen ? (
        <div className="history-modal-backdrop" onClick={() => setHistoryOpen(false)}>
          <section className="history-modal" onClick={(event) => event.stopPropagation()}>
            <div className="history-modal-header">
              <h3>Draw History</h3>
              <button type="button" className="btn btn-outline" onClick={() => setHistoryOpen(false)}>Close</button>
            </div>
            <div className="history-table">
              {drawHistory.map((item) => (
                <div key={item.dayKey} className="history-row">
                  <span>{item.dayKey}</span>
                  <strong>{item.numbers.join("-")}</strong>
                  <span>{item.total} numbers · last at {new Date(item.lastReceivedAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</span>
                </div>
              ))}
              {drawHistory.length === 0 ? <p>No draw history yet.</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      <section id="daily-missions" className="panel missions-panel">
        <div className="missions-top">
          <div className="missions-header">
            <h3>
              <span className="section-star" aria-hidden="true">★</span>
              DAILY MISSIONS
            </h3>
          </div>
          <FreeBetsPill count={dailyBetAllowanceRemaining} />
          <p className="missions-description">
            Complete Missions and You can get 1 ticket by completing 1 task.
          </p>
        </div>
        <div className="missions-grid">
          {dailyMissions.map((mission) => {
            const isCompleted = getMissionCompletionStatus(mission.id);
            const isReceived = getMissionReceivedStatus(mission.id);
            const isReceiveAvailable = isCompleted && !isReceived;
            const isClaiming = claimingMissionId === mission.id;
            const buttonLabel = isClaiming ? "Claiming..." : isReceived ? "Received" : isReceiveAvailable ? "Claim" : "Go";
            const buttonClassName = `mission-btn ${isReceived ? "mission-btn-received" : isReceiveAvailable ? "mission-btn-completed" : "mission-btn-challenge"}`;
            // Breathes while there is still something to do — only a claimed
            // reward settles the marker to a steady glow.
            const markerClassName = `mission-marker ${isCompleted ? "mission-marker-active" : ""} ${isReceived ? "" : "breathe"}`;
            const isDisabled = isClaiming;

            return (
              <article key={mission.id} className="mission-card">
                <span className={markerClassName} aria-hidden="true" />
                <p className={`mission-title ${mission.highlight ? "mission-title-highlight" : ""}`}>
                  {mission.titleLines.map((line, index) => (
                    <span key={`${mission.id}-${index}`}>
                      {line}
                      {index < mission.titleLines.length - 1 ? <br /> : null}
                    </span>
                  ))}
                </p>
                <button
                  type="button"
                  className={buttonClassName}
                  disabled={isDisabled}
                  onClick={() => handleMissionButtonClick(mission.id, isReceiveAvailable)}
                >
                  {buttonLabel}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section id="invite-mission-mobile" className="panel invite-panel live-hub-invite-panel mobile-live-invite-panel">
        <div className="invite-pill-row">
          <FreeBetsPill count={dailyBetAllowanceRemaining} />
        </div>
        <h3>
          <span className="section-star" aria-hidden="true">★</span>
          Invite a Friend to Complete Task 3
        </h3>
        <p>Copy the link and send it to a friend. Each successful registration earns you one participation token！</p>
        <div className="invite-copy-col">
          <input type="text" readOnly value={inviteLinkDisplay} aria-label="Invite link" />
          <button type="button" className="invite-copy-btn" onClick={() => void copyInviteLink()} aria-label="Copy invite link">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true" width="32" height="32">
              <rect x="8" y="8" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M6 15.5H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h9A1.5 1.5 0 0 1 15.5 5v1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </section>

      <article id="select-numbers" className="panel betting-card">
        <h2>Pick Your Lucky 4</h2>
        <p>Choose 4 numbers from 0-9. Match all 4 to win the jackpot.</p>
        <div className="number-grid">
          {Array.from({ length: 10 }, (_, i) => i).map((item) => (
            <button
              key={item}
              type="button"
              className={`num-btn ${selectedNumbers.includes(item) ? "num-selected" : ""}`}
              onClick={() => toggleNumber(item)}
              disabled={isBettingLocked}
            >
              {item}
            </button>
          ))}
        </div>

        <h3>Your Numbers</h3>
        <div className="selected-slots">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={`slot-box ${selectedNumbers[i] !== undefined ? "slot-filled" : ""}`}>
              {selectedNumbers[i] ?? "?"}
            </div>
          ))}
        </div>

        <div className="betting-actions">
          <button type="button" className="btn btn-outline betting-clear-btn" onClick={clearNumbers} disabled={isBettingLocked}>Clear</button>
          <button type="button" className="btn btn-primary betting-submit-btn" onClick={() => void confirmNumbers()} disabled={submittingEntry || isBettingLocked}>
            {submittingEntry ? "Submitting..." : "Confirm Numbers"}
          </button>
        </div>
        <p className="subtle-text callback-amounts">Deposit: {displayDepositAmount} | Bet: {displayBetAmount}</p>
        <p className="subtle-text callback-amounts">Today's betting chances: total {dailyBetAllowanceTotal}, used {dailyBetAllowanceUsed}, remaining {dailyBetAllowanceRemaining}</p>

        <p className="subtle-text">You can place multiple bets per day. Each ticket becomes active after 4 numbers and expires after 53 numbers.</p>
        {isBettingLocked ? <p className="subtle-text">Betting is currently locked by admin announcement.</p> : null}
        {playMessage ? <p className="subtle-text">{playMessage}</p> : null}
      </article>

      {ticketHistoryOpen ? (
        <div className="history-modal-backdrop" onClick={() => setTicketHistoryOpen(false)}>
          <section className="history-modal" onClick={(event) => event.stopPropagation()}>
            <div className="history-modal-header">
              <h3>My Ticket History</h3>
              <button type="button" className="btn btn-outline" onClick={() => setTicketHistoryOpen(false)}>Close</button>
            </div>
            <div className="history-table">
              {activeTicketEntries.map((entry) => (
                <div key={entry.id} className="history-row">
                  <span>{renderNumberBalls(entry.numbers, "history-number-balls")}</span>
                  <strong>{getEntryDisplayStatus(entry) === "Pending"
                    ? getPendingWindowDescription(entry)
                    : getEntryDisplayStatus(entry) === "Won"
                    ? "Won 🎉"
                    : getEntryDisplayStatus(entry) === "Abnormal"
                    ? getAbnormalDescription(entry)
                    : entry.settledAt
                    ? new Date(entry.settledAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })
                    : "Expired"}</strong>
                  <span className="history-status-pill">{getEntryDisplayStatus(entry)}</span>
                </div>
              ))}
              {activeTicketEntries.length === 0 ? <p>No ticket history yet.</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      <footer className="site-footer">
        <p>© 2025 Hamster Spin. Powered by KE7.</p>
        <p>Play responsibly. Must be 18+ to participate.</p>
      </footer>

      <MobileNav />
    </main>
  );
}
