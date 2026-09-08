"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/apiClient";

const WINNERS_PAGE_SIZE = 20;
const DRAWN_NUMBERS_PAGE_SIZE = 20;
const MERCHANT_FILTER_OPTIONS = ["ke7stg", "ke7prod"] as const;

type WinnerRow = {
  recordId: string;
  phone: string;
  merchant: string;
  status: "Pending" | "Won" | "Expired" | "Unmatched" | "Voided";
  ruleVersion?: "legacy_time_window" | "draw_window_v2" | string;
  betNumber: string;
  betTime: string;
  winningTime: string | null;
  drawsSincePlaced?: number | null;
  numbersUntilExpiry?: number | null;
  validFromNumbersAfter?: number | null;
  expiresInNumbersAfter?: number | null;
  payoutKES: number;
  jackpotBeforeSplitKES: number;
  winnerCount: number;
};

type MeResponse = {
  canAccessAdmin?: boolean;
  canAccessData?: boolean;
};

type DrawnNumberRow = {
  id: string;
  number: string;
  dayKey: string;
  receivedAt: string;
};

function toIsoIfValid(value: string): string | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getDefaultDrawnNumbersDateRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return {
    fromInput: formatDateTimeLocal(start),
    toInput: formatDateTimeLocal(end),
    fromIso: toIsoIfValid(formatDateTimeLocal(start)),
    toIso: toIsoIfValid(formatDateTimeLocal(end)),
  };
}

function getDayDateRange(dayOffset: number) {
  const now = new Date();
  const target = new Date(now);
  target.setDate(target.getDate() + dayOffset);

  const start = new Date(target);
  start.setHours(0, 0, 0, 0);

  const end = new Date(target);
  end.setHours(23, 59, 59, 999);

  return {
    fromInput: formatDateTimeLocal(start),
    toInput: formatDateTimeLocal(end),
  };
}

function normalizePhoneKeyword(value: string): string {
  return value.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
}

export default function DataPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinVerified, setPinVerified] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinSubmitting, setPinSubmitting] = useState(false);

  const [message, setMessage] = useState("");
  const [winners, setWinners] = useState<WinnerRow[]>([]);
  const [winnersTotal, setWinnersTotal] = useState(0);
  const [winnersPage, setWinnersPage] = useState(1);
  const [winnersFromInput, setWinnersFromInput] = useState(() => getDefaultDrawnNumbersDateRange().fromInput);
  const [winnersToInput, setWinnersToInput] = useState(() => getDefaultDrawnNumbersDateRange().toInput);
  const [winnersPhoneInput, setWinnersPhoneInput] = useState("");
  const [winnersMerchantInput, setWinnersMerchantInput] = useState("");
  const [winnersStatusInput, setWinnersStatusInput] = useState("");
  const [appliedWinnersFromIso, setAppliedWinnersFromIso] = useState<string | null>(() => getDefaultDrawnNumbersDateRange().fromIso);
  const [appliedWinnersToIso, setAppliedWinnersToIso] = useState<string | null>(() => getDefaultDrawnNumbersDateRange().toIso);
  const [appliedWinnersPhone, setAppliedWinnersPhone] = useState<string>("");
  const [appliedWinnersMerchant, setAppliedWinnersMerchant] = useState<string>("");
  const [appliedWinnersStatus, setAppliedWinnersStatus] = useState<string>("");
  const [isLoadingWinners, setIsLoadingWinners] = useState(false);
  const [isDownloadingCsv, setIsDownloadingCsv] = useState(false);

  const [drawnNumbers, setDrawnNumbers] = useState<DrawnNumberRow[]>([]);
  const [drawnNumbersTotal, setDrawnNumbersTotal] = useState(0);
  const [drawnNumbersPage, setDrawnNumbersPage] = useState(1);
  const [drawnNumbersFromInput, setDrawnNumbersFromInput] = useState(() => getDefaultDrawnNumbersDateRange().fromInput);
  const [drawnNumbersToInput, setDrawnNumbersToInput] = useState(() => getDefaultDrawnNumbersDateRange().toInput);
  const [appliedDrawnNumbersFromIso, setAppliedDrawnNumbersFromIso] = useState<string | null>(null);
  const [appliedDrawnNumbersToIso, setAppliedDrawnNumbersToIso] = useState<string | null>(null);
  const [isLoadingDrawnNumbers, setIsLoadingDrawnNumbers] = useState(false);
  const [isDownloadingDrawnNumbersCsv, setIsDownloadingDrawnNumbersCsv] = useState(false);

  useEffect(() => {
    const bootstrap = async () => {
      const meRes = await apiFetch("/api/auth/me", { cache: "no-store" });
      if (!meRes.ok) {
        setAuthorized(false);
        setMessage("Please log in with a data account.");
        return;
      }

      const mePayload = (await meRes.json()) as MeResponse;
      if (!mePayload?.canAccessData) {
        setAuthorized(false);
        setMessage("Data page permission required.");
        return;
      }

      setCanAccessAdmin(Boolean(mePayload.canAccessAdmin));
      setAuthorized(true);
    };

    void bootstrap();
  }, []);

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

    return `/api/data/winners?${search.toString()}`;
  };

  const loadWinners = async (params: {
    page: number;
    fromIso?: string | null;
    toIso?: string | null;
    phone?: string;
    merchant?: string;
    status?: string;
  }) => {
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

      if (!winnersRes.ok) {
        if (winnersRes.status === 401) {
          setMessage("Session expired. Please log in again.");
        } else if (winnersRes.status === 403) {
          setMessage("You do not have data permission.");
        } else {
          setMessage("Failed to load records list.");
        }
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

  const buildDrawnNumbersPath = (params: {
    limit: number;
    offset: number;
    fromIso?: string | null;
    toIso?: string | null;
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

    return `/api/data/drawn-numbers?${search.toString()}`;
  };

  const loadDrawnNumbers = async (params: {
    page: number;
    fromIso?: string | null;
    toIso?: string | null;
  }) => {
    setIsLoadingDrawnNumbers(true);

    try {
      const safePage = params.page < 1 ? 1 : params.page;
      const offset = (safePage - 1) * DRAWN_NUMBERS_PAGE_SIZE;
      const response = await apiFetch(
        buildDrawnNumbersPath({
          limit: DRAWN_NUMBERS_PAGE_SIZE,
          offset,
          fromIso: params.fromIso,
          toIso: params.toIso,
        }),
      );

      if (!response.ok) {
        if (response.status === 401) {
          setMessage("Session expired. Please log in again.");
        } else if (response.status === 403) {
          setMessage("You do not have data permission.");
        } else {
          setMessage("Failed to load Drawn Number Record.");
        }
        setIsLoadingDrawnNumbers(false);
        return;
      }

      const payload = (await response.json()) as {
        total: number;
        items: DrawnNumberRow[];
      };

      const total = typeof payload.total === "number" ? payload.total : 0;
      const totalPages = Math.max(1, Math.ceil(total / DRAWN_NUMBERS_PAGE_SIZE));
      const normalizedPage = safePage > totalPages ? totalPages : safePage;

      setDrawnNumbersTotal(total);
      setDrawnNumbers(Array.isArray(payload.items) ? payload.items : []);
      setDrawnNumbersPage(normalizedPage);
    } catch {
      setMessage("Failed to load Drawn Number Record.");
    } finally {
      setIsLoadingDrawnNumbers(false);
    }
  };

  const verifyPin = async () => {
    if (!/^\d{4}$/.test(pinInput.trim())) {
      setPinError("Please enter exactly 4 digits.");
      return;
    }

    setPinSubmitting(true);
    setPinError("");

    try {
      const response = await apiFetch("/api/data/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinInput.trim() }),
      });

      const payload = (await response.json()) as { valid?: boolean };
      if (!response.ok || payload.valid !== true) {
        setPinError("PIN invalid.");
        setPinSubmitting(false);
        return;
      }

      const defaultDrawnNumbersRange = getDefaultDrawnNumbersDateRange();
      const defaultWinnersRange = getDefaultDrawnNumbersDateRange();
      setPinVerified(true);
      setPinInput("");
      setWinnersFromInput(defaultWinnersRange.fromInput);
      setWinnersToInput(defaultWinnersRange.toInput);
      setAppliedWinnersFromIso(defaultWinnersRange.fromIso);
      setAppliedWinnersToIso(defaultWinnersRange.toIso);
      setDrawnNumbersFromInput(defaultDrawnNumbersRange.fromInput);
      setDrawnNumbersToInput(defaultDrawnNumbersRange.toInput);
      setAppliedDrawnNumbersFromIso(defaultDrawnNumbersRange.fromIso);
      setAppliedDrawnNumbersToIso(defaultDrawnNumbersRange.toIso);
      await Promise.all([
        loadWinners({ page: 1, fromIso: defaultWinnersRange.fromIso, toIso: defaultWinnersRange.toIso }),
        loadDrawnNumbers({ page: 1, fromIso: defaultDrawnNumbersRange.fromIso, toIso: defaultDrawnNumbersRange.toIso }),
      ]);
    } catch {
      setPinError("Failed to verify PIN.");
    } finally {
      setPinSubmitting(false);
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
        ? `/api/data/winners/csv?${search.toString()}`
        : "/api/data/winners/csv";

      const response = await apiFetch(path);
      if (!response.ok) {
        setMessage("Failed to download records CSV.");
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
    const defaultWinnersRange = getDefaultDrawnNumbersDateRange();
    setWinnersFromInput(defaultWinnersRange.fromInput);
    setWinnersToInput(defaultWinnersRange.toInput);
    setWinnersPhoneInput("");
    setWinnersMerchantInput("");
    setWinnersStatusInput("");
    setAppliedWinnersFromIso(defaultWinnersRange.fromIso);
    setAppliedWinnersToIso(defaultWinnersRange.toIso);
    setAppliedWinnersPhone("");
    setAppliedWinnersMerchant("");
    setAppliedWinnersStatus("");
    await loadWinners({ page: 1, fromIso: defaultWinnersRange.fromIso, toIso: defaultWinnersRange.toIso });
  };

  const setWinnersDateRange = (dayOffset: number) => {
    const range = getDayDateRange(dayOffset);
    setWinnersFromInput(range.fromInput);
    setWinnersToInput(range.toInput);
  };

  const applyDrawnNumbersDateFilter = async () => {
    const fromIso = toIsoIfValid(drawnNumbersFromInput);
    const toIso = toIsoIfValid(drawnNumbersToInput);

    if (drawnNumbersFromInput.trim() && !fromIso) {
      setMessage("Invalid start date format.");
      return;
    }

    if (drawnNumbersToInput.trim() && !toIso) {
      setMessage("Invalid end date format.");
      return;
    }

    if (fromIso && toIso && new Date(fromIso).getTime() > new Date(toIso).getTime()) {
      setMessage("Start date must be earlier than end date.");
      return;
    }

    setAppliedDrawnNumbersFromIso(fromIso);
    setAppliedDrawnNumbersToIso(toIso);
    await loadDrawnNumbers({ page: 1, fromIso, toIso });
  };

  const resetDrawnNumbersDateFilter = async () => {
    const defaultDrawnNumbersRange = getDefaultDrawnNumbersDateRange();
    setDrawnNumbersFromInput(defaultDrawnNumbersRange.fromInput);
    setDrawnNumbersToInput(defaultDrawnNumbersRange.toInput);
    setAppliedDrawnNumbersFromIso(defaultDrawnNumbersRange.fromIso);
    setAppliedDrawnNumbersToIso(defaultDrawnNumbersRange.toIso);
    await loadDrawnNumbers({ page: 1, fromIso: defaultDrawnNumbersRange.fromIso, toIso: defaultDrawnNumbersRange.toIso });
  };

  const setDrawnNumbersDateRange = (dayOffset: number) => {
    const range = getDayDateRange(dayOffset);
    setDrawnNumbersFromInput(range.fromInput);
    setDrawnNumbersToInput(range.toInput);
  };

  const downloadDrawnNumbersCsv = async () => {
    setIsDownloadingDrawnNumbersCsv(true);

    try {
      const search = new URLSearchParams();
      if (appliedDrawnNumbersFromIso) {
        search.set("from", appliedDrawnNumbersFromIso);
      }
      if (appliedDrawnNumbersToIso) {
        search.set("to", appliedDrawnNumbersToIso);
      }

      const path = search.toString().length > 0
        ? `/api/data/drawn-numbers/csv?${search.toString()}`
        : "/api/data/drawn-numbers/csv";

      const response = await apiFetch(path);
      if (!response.ok) {
        setMessage("Failed to download Drawn Number Record CSV.");
        setIsDownloadingDrawnNumbersCsv(false);
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const matched = disposition.match(/filename=([^;]+)/i);
      const filename = matched?.[1]?.replace(/^"|"$/g, "") || "drawn-number-record.csv";
      const blobUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
      setMessage("Drawn Number Record CSV downloaded.");
    } catch {
      setMessage("Failed to download Drawn Number Record CSV.");
    } finally {
      setIsDownloadingDrawnNumbersCsv(false);
    }
  };

  if (authorized === false) {
    return (
      <main style={{ padding: 24, maxWidth: 1920, margin: "0 auto", width: "100%" }}>
        <h1>Data Access Denied</h1>
        <p>{message || "Please log in with a data account."}</p>
        <a className="btn btn-outline" href="/">Back Home</a>
      </main>
    );
  }

  if (authorized === null) {
    return (
      <main style={{ padding: 24, maxWidth: 1920, margin: "0 auto", width: "100%" }}>
        <p>Checking permission...</p>
      </main>
    );
  }

  if (!pinVerified) {
    return (
      <main style={{ padding: 24, maxWidth: 1920, margin: "0 auto", width: "100%" }}>
        <h1>Data Access</h1>
        <p>Please enter 4-digit PIN to view records list.</p>
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <input
            type="password"
            inputMode="numeric"
            pattern="\\d*"
            maxLength={4}
            value={pinInput}
            onChange={(event) => setPinInput(event.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void verifyPin();
              }
            }}
            placeholder="Enter 4-digit PIN"
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => void verifyPin()} disabled={pinSubmitting}>
              {pinSubmitting ? "Verifying..." : "Enter"}
            </button>
            <a className="btn btn-outline" href="/">Back</a>
          </div>
          {pinError ? <p style={{ color: "#ffd56b", margin: 0 }}>{pinError}</p> : null}
        </div>
      </main>
    );
  }

  const totalWinnerPages = Math.max(1, Math.ceil(winnersTotal / WINNERS_PAGE_SIZE));
  const canGoPrevPage = winnersPage > 1;
  const canGoNextPage = winnersPage < totalWinnerPages;
  const totalDrawnNumberPages = Math.max(1, Math.ceil(drawnNumbersTotal / DRAWN_NUMBERS_PAGE_SIZE));
  const canGoDrawnNumbersPrevPage = drawnNumbersPage > 1;
  const canGoDrawnNumbersNextPage = drawnNumbersPage < totalDrawnNumberPages;

  return (
    <main style={{ padding: 24, maxWidth: 1920, margin: "0 auto", width: "100%" }}>
      <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, textDecoration: "none", opacity: 0.7, marginBottom: 16 }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </a>
      <h1>Data Console</h1>
      <p>Records List and CSV Export.</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {canAccessAdmin ? <a className="btn btn-outline" href="/admin">Admin</a> : null}
      </div>

      <section style={{ marginTop: 14 }}>
        <h2 style={{ marginBottom: 8 }}>Records List</h2>
        <p style={{ marginTop: 0, opacity: 0.8 }}>
          Page {winnersPage}/{totalWinnerPages}, {WINNERS_PAGE_SIZE} records per page. Current page: {winners.length} records. Total records: {winnersTotal}.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 10, marginBottom: 12 }}>
          <label htmlFor="winners-from" style={{ display: "grid", gap: 4 }}>
            <span>Start Time</span>
            <input
              id="winners-from"
              type="datetime-local"
              value={winnersFromInput}
              onChange={(event) => setWinnersFromInput(event.target.value)}
              disabled={isLoadingWinners}
            />
          </label>
          <label htmlFor="winners-to" style={{ display: "grid", gap: 4 }}>
            <span>End Time</span>
            <input
              id="winners-to"
              type="datetime-local"
              value={winnersToInput}
              onChange={(event) => setWinnersToInput(event.target.value)}
              disabled={isLoadingWinners}
            />
          </label>
          <label htmlFor="winners-phone" style={{ display: "grid", gap: 4 }}>
            <span>Phone</span>
            <input
              id="winners-phone"
              type="text"
              placeholder="Fuzzy search by phone"
              value={winnersPhoneInput}
              onChange={(event) => setWinnersPhoneInput(event.target.value)}
              disabled={isLoadingWinners}
            />
          </label>
          <label htmlFor="winners-status" style={{ display: "grid", gap: 4 }}>
            <span>Status</span>
            <select
              id="winners-status"
              value={winnersStatusInput}
              onChange={(event) => setWinnersStatusInput(event.target.value)}
              disabled={isLoadingWinners}
            >
              <option value="">All</option>
              <option value="Pending">Pending</option>
              <option value="Won">Won</option>
              <option value="Expired">Expired</option>
              <option value="Unmatched">Unmatched</option>
              <option value="Voided">Voided</option>
            </select>
          </label>
          <label htmlFor="winners-merchant" style={{ display: "grid", gap: 4 }}>
            <span>Merchant</span>
            <select
              id="winners-merchant"
              value={winnersMerchantInput}
              onChange={(event) => setWinnersMerchantInput(event.target.value)}
              disabled={isLoadingWinners}
            >
              <option value="">All</option>
              {MERCHANT_FILTER_OPTIONS.map((merchant) => (
                <option key={merchant} value={merchant}>{merchant}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => void applyWinnersDateFilter()} disabled={isLoadingWinners}>
            Search
          </button>
          <button type="button" onClick={() => void resetWinnersDateFilter()} disabled={isLoadingWinners}>
            Reset
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: -4, marginBottom: 12 }}>
          <button type="button" onClick={() => setWinnersDateRange(0)} disabled={isLoadingWinners}>
            Today
          </button>
          <button type="button" onClick={() => setWinnersDateRange(-1)} disabled={isLoadingWinners}>
            Yesterday
          </button>
        </div>

        <button type="button" onClick={downloadWinnersCsv} disabled={isDownloadingCsv}>
          {isDownloadingCsv ? "Downloading..." : "Download CSV"}
        </button>
        {isLoadingWinners ? <p style={{ marginTop: 8 }}>Loading Records List...</p> : null}

        <div style={{ overflowX: "auto", marginTop: 12, width: "100%", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "max-content", borderCollapse: "collapse", minWidth: 1560 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 6px" }}>Phone</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 6px" }}>Merchant</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 6px" }}>Status</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 6px" }}>Rule</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 6px" }}>Bet Number</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 6px" }}>Bet Time</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 6px" }}>Winning Time</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "8px 6px" }}>Draws Since Placed</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 6px" }}>Validity Window</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "8px 6px" }}>Payout (KES)</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "8px 6px" }}>Jackpot Before Split</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "8px 6px" }}>Winner Count</th>
              </tr>
            </thead>
            <tbody>
              {winners.map((winner) => (
                <tr key={winner.recordId}>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px 6px" }}>{winner.phone || "-"}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px 6px" }}>{winner.merchant || "-"}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px 6px" }}>{winner.status}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px 6px" }}>
                    {winner.ruleVersion === "draw_window_v2" ? "4+49" : "Legacy"}
                  </td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px 6px" }}>{winner.betNumber || "-"}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px 6px" }}>
                    {winner.betTime ? new Date(winner.betTime).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }) : "-"}
                  </td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px 6px" }}>
                    {winner.winningTime ? new Date(winner.winningTime).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }) : "-"}
                  </td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px 6px", textAlign: "right" }}>
                    {typeof winner.drawsSincePlaced === "number" ? Math.min(53, winner.drawsSincePlaced) : "-"}
                  </td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px 6px" }}>
                    {winner.ruleVersion === "draw_window_v2"
                      ? `Valid from ${winner.validFromNumbersAfter ?? 4} · Unmatched ${winner.numbersUntilExpiry ?? 0} numbers after`
                      : "Legacy time window"}
                  </td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px 6px", textAlign: "right" }}>{winner.payoutKES}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px 6px", textAlign: "right" }}>{winner.jackpotBeforeSplitKES}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px 6px", textAlign: "right" }}>{winner.winnerCount}</td>
                </tr>
              ))}
              {winners.length === 0 && !isLoadingWinners ? (
                <tr>
                  <td colSpan={12} style={{ padding: "12px 6px", opacity: 0.8 }}>
                    No betting records found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <button
            type="button"
            disabled={isLoadingWinners || !canGoPrevPage}
            onClick={() => void loadWinners({
              page: winnersPage - 1,
              fromIso: appliedWinnersFromIso,
              toIso: appliedWinnersToIso,
              phone: appliedWinnersPhone,
              merchant: appliedWinnersMerchant,
              status: appliedWinnersStatus,
            })}
          >
            Previous
          </button>
          <span>Page {winnersPage} of {totalWinnerPages}</span>
          <button
            type="button"
            disabled={isLoadingWinners || !canGoNextPage}
            onClick={() => void loadWinners({
              page: winnersPage + 1,
              fromIso: appliedWinnersFromIso,
              toIso: appliedWinnersToIso,
              phone: appliedWinnersPhone,
              merchant: appliedWinnersMerchant,
              status: appliedWinnersStatus,
            })}
          >
            Next
          </button>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ marginBottom: 8 }}>Drawn Number Record</h2>
        <p style={{ marginTop: 0, opacity: 0.8 }}>
          Page {drawnNumbersPage}/{totalDrawnNumberPages}, {DRAWN_NUMBERS_PAGE_SIZE} records per page. Current page: {drawnNumbers.length} records. Total records: {drawnNumbersTotal}.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 10, marginBottom: 12 }}>
          <label htmlFor="drawn-numbers-from" style={{ display: "grid", gap: 4 }}>
            <span>Received At Start Time</span>
            <input
              id="drawn-numbers-from"
              type="datetime-local"
              value={drawnNumbersFromInput}
              onChange={(event) => setDrawnNumbersFromInput(event.target.value)}
              disabled={isLoadingDrawnNumbers}
            />
          </label>
          <label htmlFor="drawn-numbers-to" style={{ display: "grid", gap: 4 }}>
            <span>Received At End Time</span>
            <input
              id="drawn-numbers-to"
              type="datetime-local"
              value={drawnNumbersToInput}
              onChange={(event) => setDrawnNumbersToInput(event.target.value)}
              disabled={isLoadingDrawnNumbers}
            />
          </label>
          <button type="button" onClick={() => void applyDrawnNumbersDateFilter()} disabled={isLoadingDrawnNumbers}>
            Search
          </button>
          <button type="button" onClick={() => void resetDrawnNumbersDateFilter()} disabled={isLoadingDrawnNumbers}>
            Reset
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: -4, marginBottom: 12 }}>
          <button type="button" onClick={() => setDrawnNumbersDateRange(0)} disabled={isLoadingDrawnNumbers}>
            Today
          </button>
          <button type="button" onClick={() => setDrawnNumbersDateRange(-1)} disabled={isLoadingDrawnNumbers}>
            Yesterday
          </button>
        </div>

        <button type="button" onClick={downloadDrawnNumbersCsv} disabled={isDownloadingDrawnNumbersCsv}>
          {isDownloadingDrawnNumbersCsv ? "Downloading..." : "Download CSV"}
        </button>

        {isLoadingDrawnNumbers ? <p style={{ marginTop: 8 }}>Loading Drawn Number Record...</p> : null}

        <div style={{ overflowX: "auto", marginTop: 12, width: "100%", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "max-content", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 6px" }}>ID</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "8px 6px" }}>Number</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 6px" }}>Date</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 6px" }}>Received At</th>
              </tr>
            </thead>
            <tbody>
              {drawnNumbers.map((row) => (
                <tr key={row.id}>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px 6px" }}>{row.id}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px 6px", textAlign: "right" }}>{row.number}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px 6px" }}>{row.dayKey || "-"}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "8px 6px" }}>
                    {row.receivedAt ? new Date(row.receivedAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }) : "-"}
                  </td>
                </tr>
              ))}
              {drawnNumbers.length === 0 && !isLoadingDrawnNumbers ? (
                <tr>
                  <td colSpan={4} style={{ padding: "12px 6px", opacity: 0.8 }}>
                    No drawn number records found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <button
            type="button"
            disabled={isLoadingDrawnNumbers || !canGoDrawnNumbersPrevPage}
            onClick={() => void loadDrawnNumbers({
              page: drawnNumbersPage - 1,
              fromIso: appliedDrawnNumbersFromIso,
              toIso: appliedDrawnNumbersToIso,
            })}
          >
            Previous
          </button>
          <span>Page {drawnNumbersPage} of {totalDrawnNumberPages}</span>
          <button
            type="button"
            disabled={isLoadingDrawnNumbers || !canGoDrawnNumbersNextPage}
            onClick={() => void loadDrawnNumbers({
              page: drawnNumbersPage + 1,
              fromIso: appliedDrawnNumbersFromIso,
              toIso: appliedDrawnNumbersToIso,
            })}
          >
            Next
          </button>
        </div>
      </section>

      {message ? <p style={{ marginTop: 12 }}>{message}</p> : null}
    </main>
  );
}
