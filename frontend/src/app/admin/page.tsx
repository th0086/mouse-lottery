"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/apiClient";

const WINNERS_PAGE_SIZE = 20;
const MERCHANT_FILTER_OPTIONS = ["ke7stg", "ke7prod"] as const;

type WinnerRow = {
  recordId: string;
  entryId: string;
  userId: string;
  phone: string;
  merchant: string;
  status: "Pending" | "Won" | "Expired" | "Unmatched" | "Voided";
  betNumber: string;
  betTime: string;
  winningTime: string | null;
  settledAt: string | null;
  payoutKES: number;
  jackpotBeforeSplitKES: number;
  winnerCount: number;
  settlementKey: string | null;
};

type MissionThresholdsResponse = {
  turnoverMissionThreshold: number;
  depositMissionThreshold: number;
  pendingTurnoverMissionThreshold: number | null;
  pendingDepositMissionThreshold: number | null;
  pendingEffectiveDayKey: string | null;
  activeToday: {
    turnoverMissionThreshold: number;
    depositMissionThreshold: number;
  };
};

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }

  return `${hours}h ${minutes}m ${seconds}s`;
}

export default function AdminPage() {
  const [jackpotIncrementAmount, setJackpotIncrementAmount] = useState("");
  const [dataPin, setDataPin] = useState("1234");
  const [youtubeVideoId, setYoutubeVideoId] = useState("");
  const [liveOverlayEnabled, setLiveOverlayEnabled] = useState(false);
  const [announcementEnabled, setAnnouncementEnabled] = useState(false);
  const [announcementContent, setAnnouncementContent] = useState("");
  const [winners, setWinners] = useState<WinnerRow[]>([]);
  const [winnersTotal, setWinnersTotal] = useState(0);
  const [winnersPage, setWinnersPage] = useState(1);
  const [winnersFromInput, setWinnersFromInput] = useState("");
  const [winnersToInput, setWinnersToInput] = useState("");
  const [winnersPhoneInput, setWinnersPhoneInput] = useState("");
  const [winnersMerchantInput, setWinnersMerchantInput] = useState("");
  const [winnersStatusInput, setWinnersStatusInput] = useState("");
  const [appliedWinnersFromIso, setAppliedWinnersFromIso] = useState<string | null>(null);
  const [appliedWinnersToIso, setAppliedWinnersToIso] = useState<string | null>(null);
  const [appliedWinnersPhone, setAppliedWinnersPhone] = useState<string>("");
  const [appliedWinnersMerchant, setAppliedWinnersMerchant] = useState<string>("");
  const [appliedWinnersStatus, setAppliedWinnersStatus] = useState<string>("");
  const [isLoadingWinners, setIsLoadingWinners] = useState(false);
  const [isDownloadingCsv, setIsDownloadingCsv] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [turnoverMissionThreshold, setTurnoverMissionThreshold] = useState("1000");
  const [depositMissionThreshold, setDepositMissionThreshold] = useState("99");
  const [pendingTurnoverMissionThreshold, setPendingTurnoverMissionThreshold] = useState<number | null>(null);
  const [pendingDepositMissionThreshold, setPendingDepositMissionThreshold] = useState<number | null>(null);
  const [pendingMissionThresholdsEffectiveDayKey, setPendingMissionThresholdsEffectiveDayKey] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const pendingEffectiveStartMs = pendingMissionThresholdsEffectiveDayKey
    ? Date.parse(`${pendingMissionThresholdsEffectiveDayKey}T00:00:00+03:00`)
    : null;
  const pendingCountdownSeconds = pendingEffectiveStartMs
    ? Math.max(0, Math.floor((pendingEffectiveStartMs - nowMs) / 1000))
    : null;

  const normalizePhoneKeyword = (value: string): string => {
    return value.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
  };

  const buildWinnersPath = (params: {
    limit: number;
    offset: number;
    fromIso?: string | null;
    toIso?: string | null;
    phone?: string;
    merchant?: string;
    status?: string;
  }) => {
    const search = new URLSearchParams();
    search.set("limit", String(params.limit));
    search.set("offset", String(params.offset));

    if (params.fromIso) {
      search.set("from", params.fromIso);
    }

    if (params.toIso) {
      search.set("to", params.toIso);
    }

    if (params.phone && params.phone.trim().length > 0) {
      search.set("phone", normalizePhoneKeyword(params.phone));
    }

    if (params.merchant && params.merchant.trim().length > 0) {
      search.set("merchant", params.merchant.trim());
    }

    if (params.status && params.status.trim().length > 0) {
      search.set("status", params.status);
    }

    return `/api/admin/winners?${search.toString()}`;
  };

  const toIsoIfValid = (value: string): string | null => {
    if (!value.trim()) {
      return null;
    }

    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString();
  };

  const loadWinners = async (params: {
    page: number;
    fromIso?: string | null;
    toIso?: string | null;
    phone?: string;
    merchant?: string;
    status?: string;
  }) => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setMessage("Please log in with an admin account.");
      setIsLoading(false);
      return;
    }

    setIsLoadingWinners(true);

    try {
      const safePage = params.page < 1 ? 1 : params.page;
      const offset = (safePage - 1) * WINNERS_PAGE_SIZE;
      const winnersRes = await apiFetch(
        buildWinnersPath({
          limit: WINNERS_PAGE_SIZE,
          offset,
          fromIso: params.fromIso,
          toIso: params.toIso,
          phone: params.phone,
          merchant: params.merchant,
          status: params.status,
        }),
      );

      if (winnersRes.status === 401) {
        setMessage("Session expired. Please log in again.");
        setIsLoadingWinners(false);
        return;
      }

      if (winnersRes.status === 403) {
        setMessage("You do not have admin permission.");
        setIsLoadingWinners(false);
        return;
      }

      if (!winnersRes.ok) {
        setMessage("Failed to load records list.");
        setIsLoadingWinners(false);
        return;
      }

      const winnersPayload = (await winnersRes.json()) as {
        total: number;
        items: WinnerRow[];
      };

      const total = typeof winnersPayload.total === "number" ? winnersPayload.total : 0;
      const totalPages = Math.max(1, Math.ceil(total / WINNERS_PAGE_SIZE));
      const normalizedPage = safePage > totalPages ? totalPages : safePage;

      setWinnersTotal(total);
      setWinners(Array.isArray(winnersPayload.items) ? winnersPayload.items : []);
      setWinnersPage(normalizedPage);
    } catch {
      setMessage("Failed to load records list.");
    } finally {
      setIsLoadingWinners(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setMessage("Please log in with an admin account.");
      setIsLoading(false);
      return;
    }

    const load = async () => {
      try {
        const [jackpotRes, dataPinRes, liveRes, announcementRes, missionThresholdsRes] = await Promise.all([
          apiFetch("/api/admin/jackpot-increment"),
          apiFetch("/api/admin/data-pin"),
          apiFetch("/api/admin/live-config"),
          apiFetch("/api/announcement"),
          apiFetch("/api/admin/mission-thresholds"),
        ]);

        if (jackpotRes.status === 401 || dataPinRes.status === 401 || liveRes.status === 401 || announcementRes.status === 401 || missionThresholdsRes.status === 401) {
          setMessage("Session expired. Please log in again.");
          setIsLoading(false);
          return;
        }

        if (jackpotRes.status === 403 || dataPinRes.status === 403 || liveRes.status === 403 || announcementRes.status === 403 || missionThresholdsRes.status === 403) {
          setMessage("You do not have admin permission.");
          setIsLoading(false);
          return;
        }

        if (jackpotRes.ok) {
          const jackpot = (await jackpotRes.json()) as { jackpotIncrementAmount: number };
          setJackpotIncrementAmount(String(jackpot.jackpotIncrementAmount));
        }

        if (dataPinRes.ok) {
          const dataPinPayload = (await dataPinRes.json()) as { dataPin: string };
          setDataPin(typeof dataPinPayload.dataPin === "string" ? dataPinPayload.dataPin : "1234");
        }

        if (liveRes.ok) {
          const live = (await liveRes.json()) as {
            youtubeVideoId: string;
            liveOverlayEnabled?: boolean;
          };
          setYoutubeVideoId(live.youtubeVideoId);
          setLiveOverlayEnabled(live.liveOverlayEnabled ?? true);
        }

        if (announcementRes.ok) {
          const announcement = (await announcementRes.json()) as {
            enabled: boolean;
            content: string;
          };
          setAnnouncementEnabled(Boolean(announcement.enabled));
          setAnnouncementContent(typeof announcement.content === "string" ? announcement.content : "");
        }

        if (missionThresholdsRes.ok) {
          const missionThresholds = (await missionThresholdsRes.json()) as MissionThresholdsResponse;
          setTurnoverMissionThreshold(String(missionThresholds.turnoverMissionThreshold ?? 1000));
          setDepositMissionThreshold(String(missionThresholds.depositMissionThreshold ?? 99));
          setPendingTurnoverMissionThreshold(
            typeof missionThresholds.pendingTurnoverMissionThreshold === "number"
              ? missionThresholds.pendingTurnoverMissionThreshold
              : null,
          );
          setPendingDepositMissionThreshold(
            typeof missionThresholds.pendingDepositMissionThreshold === "number"
              ? missionThresholds.pendingDepositMissionThreshold
              : null,
          );
          setPendingMissionThresholdsEffectiveDayKey(
            typeof missionThresholds.pendingEffectiveDayKey === "string" ? missionThresholds.pendingEffectiveDayKey : null,
          );
        }

        await loadWinners({ page: 1 });
        setIsLoading(false);
      } catch {
        setMessage("Failed to load admin config. Backend service may be unavailable.");
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const save = async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setMessage("Please log in with an admin account.");
      return;
    }

    try {
      const [jackpotRes, dataPinRes, liveRes, missionThresholdsRes] = await Promise.all([
        apiFetch("/api/admin/jackpot-increment", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ amount: Number(jackpotIncrementAmount) }),
        }),
        apiFetch("/api/admin/data-pin", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pin: dataPin }),
        }),
        apiFetch("/api/admin/live-config", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            youtubeVideoId,
            liveOverlayEnabled,
          }),
        }),
        apiFetch("/api/admin/mission-thresholds", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            turnoverMissionThreshold: Number(turnoverMissionThreshold),
            depositMissionThreshold: Number(depositMissionThreshold),
          }),
        }),
      ]);

      const announcementRes = await apiFetch("/api/announcement", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enabled: announcementEnabled,
          content: announcementContent,
        }),
      });

      if (jackpotRes.ok && dataPinRes.ok && liveRes.ok && announcementRes.ok && missionThresholdsRes.ok) {
        const missionThresholds = (await missionThresholdsRes.json()) as MissionThresholdsResponse;
        setPendingTurnoverMissionThreshold(
          typeof missionThresholds.pendingTurnoverMissionThreshold === "number"
            ? missionThresholds.pendingTurnoverMissionThreshold
            : null,
        );
        setPendingDepositMissionThreshold(
          typeof missionThresholds.pendingDepositMissionThreshold === "number"
            ? missionThresholds.pendingDepositMissionThreshold
            : null,
        );
        setPendingMissionThresholdsEffectiveDayKey(
          typeof missionThresholds.pendingEffectiveDayKey === "string" ? missionThresholds.pendingEffectiveDayKey : null,
        );
        setMessage("Admin configuration updated. Mission thresholds will take effect on the next Kenya day.");
        return;
      }

      if (jackpotRes.status === 401 || dataPinRes.status === 401 || liveRes.status === 401 || announcementRes.status === 401 || missionThresholdsRes.status === 401) {
        setMessage("Session expired. Please log in again.");
        return;
      }

      if (jackpotRes.status === 403 || dataPinRes.status === 403 || liveRes.status === 403 || announcementRes.status === 403 || missionThresholdsRes.status === 403) {
        setMessage("You do not have admin permission.");
        return;
      }

      setMessage("Failed to update one or more settings.");
    } catch {
      setMessage("Failed to save. Backend service may be unavailable.");
    }
  };

  const downloadWinnersCsv = async () => {
    setIsDownloadingCsv(true);
    try {
      const search = new URLSearchParams();
      if (appliedWinnersFromIso) {
        search.set("from", appliedWinnersFromIso);
      }
      if (appliedWinnersToIso) {
        search.set("to", appliedWinnersToIso);
      }
      if (appliedWinnersPhone.trim().length > 0) {
        search.set("phone", normalizePhoneKeyword(appliedWinnersPhone));
      }
      if (appliedWinnersMerchant.trim().length > 0) {
        search.set("merchant", appliedWinnersMerchant.trim());
      }
      if (appliedWinnersStatus.trim().length > 0) {
        search.set("status", appliedWinnersStatus);
      }

      const path = search.toString().length > 0
        ? `/api/admin/winners/csv?${search.toString()}`
        : "/api/admin/winners/csv";

      const response = await apiFetch(path);
      if (!response.ok) {
        if (response.status === 401) {
          setMessage("Session expired. Please log in again.");
        } else if (response.status === 403) {
          setMessage("You do not have admin permission.");
        } else {
          setMessage("Failed to download records CSV.");
        }
        setIsDownloadingCsv(false);
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const matched = disposition.match(/filename=([^;]+)/i);
      const filename = matched?.[1]?.replace(/^"|"$/g, "") || "records-list.csv";
      const blobUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
      setMessage("Records CSV downloaded.");
    } catch {
      setMessage("Failed to download records CSV.");
    } finally {
      setIsDownloadingCsv(false);
    }
  };

  const applyWinnersDateFilter = async () => {
    const fromIso = toIsoIfValid(winnersFromInput);
    const toIso = toIsoIfValid(winnersToInput);

    if (winnersFromInput.trim() && !fromIso) {
      setMessage("Invalid start date format.");
      return;
    }

    if (winnersToInput.trim() && !toIso) {
      setMessage("Invalid end date format.");
      return;
    }

    if (fromIso && toIso && new Date(fromIso).getTime() > new Date(toIso).getTime()) {
      setMessage("Start date must be earlier than end date.");
      return;
    }

    setAppliedWinnersFromIso(fromIso);
    setAppliedWinnersToIso(toIso);
    const nextPhone = normalizePhoneKeyword(winnersPhoneInput);
    const nextMerchant = winnersMerchantInput.trim();
    const nextStatus = winnersStatusInput;
    setAppliedWinnersPhone(nextPhone);
    setAppliedWinnersMerchant(nextMerchant);
    setAppliedWinnersStatus(nextStatus);
    await loadWinners({
      page: 1,
      fromIso,
      toIso,
      phone: nextPhone,
      merchant: nextMerchant,
      status: nextStatus,
    });
  };

  const resetWinnersDateFilter = async () => {
    setWinnersFromInput("");
    setWinnersToInput("");
    setWinnersPhoneInput("");
    setWinnersMerchantInput("");
    setWinnersStatusInput("");
    setAppliedWinnersFromIso(null);
    setAppliedWinnersToIso(null);
    setAppliedWinnersPhone("");
    setAppliedWinnersMerchant("");
    setAppliedWinnersStatus("");
    await loadWinners({ page: 1 });
  };

  const totalWinnerPages = Math.max(1, Math.ceil(winnersTotal / WINNERS_PAGE_SIZE));
  const canGoPrevPage = winnersPage > 1;
  const canGoNextPage = winnersPage < totalWinnerPages;

  return (
    <main style={{ padding: 24, maxWidth: 1920, margin: "0 auto", width: "100%" }}>
      <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, textDecoration: "none", opacity: 0.7, marginBottom: 16 }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </a>
      <h1>Admin Console</h1>
      <p>Manage jackpot increment, YouTube live source config, site announcement, and betting records.</p>

      <section style={{ display: "grid", gap: 10, marginTop: 14 }}>
        <label htmlFor="jackpot-increment">Jackpot Increment (KES/second)</label>
        <input
          id="jackpot-increment"
          type="number"
          min={1}
          value={jackpotIncrementAmount}
          onChange={(event) => setJackpotIncrementAmount(event.target.value)}
          disabled={isLoading}
        />

        <label htmlFor="youtube-video-id">YouTube Video ID</label>
        <input
          id="youtube-video-id"
          value={youtubeVideoId}
          onChange={(event) => setYoutubeVideoId(event.target.value)}
          disabled={isLoading}
        />

        <label htmlFor="data-pin">Data PIN (4 digits)</label>
        <input
          id="data-pin"
          value={dataPin}
          onChange={(event) => setDataPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
          disabled={isLoading}
          maxLength={4}
          inputMode="numeric"
        />

        <label htmlFor="live-overlay-enabled">Live Overlay Enabled</label>
        <input
          id="live-overlay-enabled"
          type="checkbox"
          checked={liveOverlayEnabled}
          onChange={(event) => setLiveOverlayEnabled(event.target.checked)}
          disabled={isLoading}
          style={{ width: 20, height: 20 }}
        />

        <label htmlFor="announcement-enabled">Announcement Enabled</label>
        <input
          id="announcement-enabled"
          type="checkbox"
          checked={announcementEnabled}
          onChange={(event) => setAnnouncementEnabled(event.target.checked)}
          disabled={isLoading}
          style={{ width: 20, height: 20 }}
        />

        <label htmlFor="announcement-content">Announcement Content</label>
        <textarea
          id="announcement-content"
          value={announcementContent}
          onChange={(event) => setAnnouncementContent(event.target.value)}
          disabled={isLoading}
          rows={6}
          style={{ resize: "vertical", fontFamily: "inherit", padding: 10 }}
          placeholder="Enter announcement details shown on the homepage popup"
        />

        <h3 style={{ marginTop: 10, marginBottom: 0 }}>Mission Thresholds (next-day effective)</h3>
        <p style={{ marginTop: 4, opacity: 0.8 }}>
          Changes are queued and will only become active on the next Kenya day.
          {pendingMissionThresholdsEffectiveDayKey ? ` Pending effective day: ${pendingMissionThresholdsEffectiveDayKey}.` : ""}
          {pendingMissionThresholdsEffectiveDayKey && pendingCountdownSeconds !== null
            ? ` Countdown: ${formatCountdown(pendingCountdownSeconds)}.`
            : ""}
        </p>

        <label htmlFor="turnover-mission-threshold">Generate Turnover Mission Threshold</label>
        <input
          id="turnover-mission-threshold"
          type="number"
          min={1}
          value={turnoverMissionThreshold}
          onChange={(event) => setTurnoverMissionThreshold(event.target.value)}
          disabled={isLoading}
        />

        <label htmlFor="deposit-mission-threshold">Deposit Mission Threshold (KES)</label>
        <input
          id="deposit-mission-threshold"
          type="number"
          min={1}
          value={depositMissionThreshold}
          onChange={(event) => setDepositMissionThreshold(event.target.value)}
          disabled={isLoading}
        />

        {pendingTurnoverMissionThreshold !== null || pendingDepositMissionThreshold !== null ? (
          <p style={{ margin: 0, opacity: 0.8 }}>
            Pending thresholds: Turnover {pendingTurnoverMissionThreshold ?? "-"}, Deposit {pendingDepositMissionThreshold ?? "-"}.
          </p>
        ) : null}

        <button
          type="button"
          onClick={save}
          style={{ width: "fit-content" }}
          disabled={
            isLoading
            || !jackpotIncrementAmount.trim()
            || !youtubeVideoId.trim()
            || !turnoverMissionThreshold.trim()
            || !depositMissionThreshold.trim()
          }
        >
          Save
        </button>
        {isLoading ? <p>Loading admin config...</p> : null}
        {message ? <p>{message}</p> : null}
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ marginBottom: 8 }}>Records List</h2>
        <p style={{ marginTop: 0, opacity: 0.8 }}>
          Records List has been moved to the Data page.
        </p>
        <a className="btn btn-outline" href="/data">Go to Data Page</a>
      </section>
    </main>
  );
}
