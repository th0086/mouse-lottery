import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { DrawnNumber, DrawnNumberDocument } from "../draws/drawn-number.schema";
import { Entry, EntryDocument } from "../draws/entry.schema";
import { PayoutRecord, PayoutRecordDocument } from "../draws/payout-record.schema";
import { User, UserDocument } from "../users/user.schema";
import { DrawnNumbersQueryDto, UpdateMissionThresholdsDto, WinnersQueryDto } from "./admin.dto";
import { AdminConfig, AdminConfigDocument } from "./admin-config.schema";

type RecordRow = {
  recordId: string;
  entryId: string;
  userId: string;
  phone: string;
  merchant: string;
  status: string;
  ruleVersion: string;
  betNumber: string;
  betTime: string;
  winningTime: string | null;
  drawsSincePlaced: number | null;
  numbersUntilExpiry: number | null;
  validFromNumbersAfter: number | null;
  expiresInNumbersAfter: number | null;
  payoutKES: number;
  jackpotBeforeSplitKES: number;
  winnerCount: number;
  settlementKey: string | null;
  settledAt: string | null;
};

type AggregatedRecord = {
  _id: unknown;
  userId: unknown;
  phone?: string;
  merchantId?: string;
  status?: string;
  ruleVersion?: string;
  placedAfterDrawCount?: number;
  numbers?: number[];
  placedAt: Date;
  winningSequenceEndedAt?: Date;
  settledAt?: Date;
  payoutKES?: number;
  jackpotBeforeSplitKES?: number;
  winnerCount?: number;
  settlementKey?: string;
};

const DRAW_WINDOW_VALID_FROM_AFTER = 4;
const DRAW_WINDOW_EXPIRES_AFTER = 53;
const ENTRY_RULE_DRAW_WINDOW_V2 = "draw_window_v2";

type DrawnNumberRow = {
  id: string;
  number: string;
  dayKey: string;
  receivedAt: string;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePhoneFilter(value: string | undefined): string {
  if (!value) {
    return "";
  }

  return value.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
}

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatBetNumberForCsv(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  // Excel/Sheets may coerce plain numeric strings (e.g. 0123) to numbers.
  // Export as a text formula so leading zeros are preserved when opening CSV files.
  if (/^\d+$/.test(normalized)) {
    return `="${normalized}"`;
  }

  return normalized;
}

const KENYA_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3 (Africa/Nairobi)

const kenyaDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Nairobi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatKenyaDateTime(date: Date): string {
  const parts = kenyaDateTimeFormatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      partMap[part.type] = part.value;
    }
  }

  return `${partMap.year}-${partMap.month}-${partMap.day} ${partMap.hour}:${partMap.minute}:${partMap.second} EAT`;
}

function formatKenyaDateTimeFromIso(value: string | null): string {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return formatKenyaDateTime(parsed);
}

function toKenyaDayKey(date: Date): string {
  return new Date(date.getTime() + KENYA_OFFSET_MS).toISOString().slice(0, 10);
}

function nextKenyaDayKey(date: Date): string {
  const todayKey = toKenyaDayKey(date);
  const base = new Date(`${todayKey}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + 1);
  return base.toISOString().slice(0, 10);
}

@Injectable()
export class AdminService implements OnModuleInit {
  private readonly logger = new Logger(AdminService.name);
  private readonly configKey = "runtime";
  private readonly defaultConfig = {
    youtubeVideoId: "dQw4w9WgXcQ",
    liveOverlayEnabled: false,
    realtimeMode: "polling",
    pollingIntervalSeconds: 5,
    jackpotIncrementAmount: 10,
    dataPin: "1234",
    turnoverMissionThreshold: 1000,
    depositMissionThreshold: 200,
    pendingTurnoverMissionThreshold: undefined as number | undefined,
    pendingDepositMissionThreshold: undefined as number | undefined,
    pendingMissionThresholdsEffectiveDayKey: undefined as string | undefined,
  };
  private config = { ...this.defaultConfig };
  private loaded = false;

  constructor(
    @InjectModel(AdminConfig.name)
    private readonly adminConfigModel: Model<AdminConfigDocument>,
    @InjectModel(PayoutRecord.name)
    private readonly payoutRecordModel: Model<PayoutRecordDocument>,
    @InjectModel(Entry.name)
    private readonly entryModel: Model<EntryDocument>,
    @InjectModel(DrawnNumber.name)
    private readonly drawnNumberModel: Model<DrawnNumberDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    this.defaultConfig.dataPin = this.getDefaultDataPin();
    await this.ensureConfigLoaded();
  }

  private async ensureConfigLoaded() {
    if (this.loaded) {
      return;
    }

    const existing = await this.adminConfigModel.findOne({ key: this.configKey }).lean();
    if (!existing) {
      await this.adminConfigModel.create({ key: this.configKey, ...this.defaultConfig });
      this.config = { ...this.defaultConfig };
      this.loaded = true;
      return;
    }

    this.config = {
      youtubeVideoId: existing.youtubeVideoId ?? this.defaultConfig.youtubeVideoId,
      liveOverlayEnabled: existing.liveOverlayEnabled ?? this.defaultConfig.liveOverlayEnabled,
      realtimeMode: existing.realtimeMode ?? this.defaultConfig.realtimeMode,
      pollingIntervalSeconds: existing.pollingIntervalSeconds ?? this.defaultConfig.pollingIntervalSeconds,
      jackpotIncrementAmount: existing.jackpotIncrementAmount ?? this.defaultConfig.jackpotIncrementAmount,
      dataPin:
        typeof existing.dataPin === "string" && /^\d{4}$/.test(existing.dataPin)
          ? existing.dataPin
          : this.defaultConfig.dataPin,
      turnoverMissionThreshold:
        typeof existing.turnoverMissionThreshold === "number" && Number.isFinite(existing.turnoverMissionThreshold)
          ? Math.max(1, Math.floor(existing.turnoverMissionThreshold))
          : this.defaultConfig.turnoverMissionThreshold,
      depositMissionThreshold:
        typeof existing.depositMissionThreshold === "number" && Number.isFinite(existing.depositMissionThreshold)
          ? Math.max(1, Math.floor(existing.depositMissionThreshold))
          : this.defaultConfig.depositMissionThreshold,
      pendingTurnoverMissionThreshold:
        typeof existing.pendingTurnoverMissionThreshold === "number" && Number.isFinite(existing.pendingTurnoverMissionThreshold)
          ? Math.max(1, Math.floor(existing.pendingTurnoverMissionThreshold))
          : undefined,
      pendingDepositMissionThreshold:
        typeof existing.pendingDepositMissionThreshold === "number" && Number.isFinite(existing.pendingDepositMissionThreshold)
          ? Math.max(1, Math.floor(existing.pendingDepositMissionThreshold))
          : undefined,
      pendingMissionThresholdsEffectiveDayKey:
        typeof existing.pendingMissionThresholdsEffectiveDayKey === "string"
          ? existing.pendingMissionThresholdsEffectiveDayKey
          : undefined,
    };
    this.loaded = true;
  }

  private async persistConfig() {
    const updated = await this.adminConfigModel.findOneAndUpdate(
      { key: this.configKey },
      { $set: this.config },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    ).lean();

    if (!updated) {
      this.logger.warn("Admin config persistence returned no document.");
      return;
    }

    this.config = {
      youtubeVideoId: updated.youtubeVideoId ?? this.defaultConfig.youtubeVideoId,
      liveOverlayEnabled: updated.liveOverlayEnabled ?? this.defaultConfig.liveOverlayEnabled,
      realtimeMode: updated.realtimeMode ?? this.defaultConfig.realtimeMode,
      pollingIntervalSeconds: updated.pollingIntervalSeconds ?? this.defaultConfig.pollingIntervalSeconds,
      jackpotIncrementAmount: updated.jackpotIncrementAmount ?? this.defaultConfig.jackpotIncrementAmount,
      dataPin:
        typeof updated.dataPin === "string" && /^\d{4}$/.test(updated.dataPin)
          ? updated.dataPin
          : this.defaultConfig.dataPin,
      turnoverMissionThreshold:
        typeof updated.turnoverMissionThreshold === "number" && Number.isFinite(updated.turnoverMissionThreshold)
          ? Math.max(1, Math.floor(updated.turnoverMissionThreshold))
          : this.defaultConfig.turnoverMissionThreshold,
      depositMissionThreshold:
        typeof updated.depositMissionThreshold === "number" && Number.isFinite(updated.depositMissionThreshold)
          ? Math.max(1, Math.floor(updated.depositMissionThreshold))
          : this.defaultConfig.depositMissionThreshold,
      pendingTurnoverMissionThreshold:
        typeof updated.pendingTurnoverMissionThreshold === "number" && Number.isFinite(updated.pendingTurnoverMissionThreshold)
          ? Math.max(1, Math.floor(updated.pendingTurnoverMissionThreshold))
          : undefined,
      pendingDepositMissionThreshold:
        typeof updated.pendingDepositMissionThreshold === "number" && Number.isFinite(updated.pendingDepositMissionThreshold)
          ? Math.max(1, Math.floor(updated.pendingDepositMissionThreshold))
          : undefined,
      pendingMissionThresholdsEffectiveDayKey:
        typeof updated.pendingMissionThresholdsEffectiveDayKey === "string"
          ? updated.pendingMissionThresholdsEffectiveDayKey
          : undefined,
    };
  }

  async getMissionThresholds() {
    await this.ensureConfigLoaded();
    const todayKey = toKenyaDayKey(new Date());
    const pendingActive = Boolean(
      this.config.pendingMissionThresholdsEffectiveDayKey
      && todayKey >= this.config.pendingMissionThresholdsEffectiveDayKey,
    );

    return {
      turnoverMissionThreshold: this.config.turnoverMissionThreshold,
      depositMissionThreshold: this.config.depositMissionThreshold,
      pendingTurnoverMissionThreshold: this.config.pendingTurnoverMissionThreshold ?? null,
      pendingDepositMissionThreshold: this.config.pendingDepositMissionThreshold ?? null,
      pendingEffectiveDayKey: this.config.pendingMissionThresholdsEffectiveDayKey ?? null,
      activeToday: {
        turnoverMissionThreshold: pendingActive
          ? (this.config.pendingTurnoverMissionThreshold ?? this.config.turnoverMissionThreshold)
          : this.config.turnoverMissionThreshold,
        depositMissionThreshold: pendingActive
          ? (this.config.pendingDepositMissionThreshold ?? this.config.depositMissionThreshold)
          : this.config.depositMissionThreshold,
      },
    };
  }

  async updateMissionThresholds(dto: UpdateMissionThresholdsDto) {
    await this.ensureConfigLoaded();
    this.config.pendingTurnoverMissionThreshold = Math.max(1, Math.floor(dto.turnoverMissionThreshold));
    this.config.pendingDepositMissionThreshold = Math.max(1, Math.floor(dto.depositMissionThreshold));
    this.config.pendingMissionThresholdsEffectiveDayKey = nextKenyaDayKey(new Date());
    await this.persistConfig();

    return this.getMissionThresholds();
  }

  async getLiveConfig() {
    await this.ensureConfigLoaded();
    return {
      youtubeVideoId: this.config.youtubeVideoId,
      liveOverlayEnabled: this.config.liveOverlayEnabled,
      realtimeMode: this.config.realtimeMode,
      pollingIntervalSeconds: this.config.pollingIntervalSeconds,
    };
  }

  async updateLiveConfig(params: {
    youtubeVideoId?: string;
    liveOverlayEnabled?: boolean;
  }) {
    await this.ensureConfigLoaded();

    if (typeof params.youtubeVideoId === "string" && params.youtubeVideoId.trim().length > 0) {
      this.config.youtubeVideoId = params.youtubeVideoId;
    }

    if (typeof params.liveOverlayEnabled === "boolean") {
      this.config.liveOverlayEnabled = params.liveOverlayEnabled;
    }

    await this.persistConfig();
    return this.getLiveConfig();
  }

  async getGameRuntimeConfig() {
    await this.ensureConfigLoaded();
    return {
      youtubeVideoId: this.config.youtubeVideoId,
      liveOverlayEnabled: this.config.liveOverlayEnabled,
      realtimeMode: this.config.realtimeMode,
      pollingIntervalSeconds: this.config.pollingIntervalSeconds,
      jackpotIncrementAmount: this.config.jackpotIncrementAmount,
      dataPin: this.config.dataPin,
    };
  }

  async getJackpotIncrement() {
    await this.ensureConfigLoaded();
    return { jackpotIncrementAmount: this.config.jackpotIncrementAmount };
  }

  async updateJackpotIncrement(amount: number) {
    await this.ensureConfigLoaded();
    this.config.jackpotIncrementAmount = amount;
    await this.persistConfig();
  }

  async getDataPin() {
    await this.ensureConfigLoaded();
    return { dataPin: this.config.dataPin };
  }

  async updateDataPin(pin: string) {
    await this.ensureConfigLoaded();
    this.config.dataPin = pin;
    await this.persistConfig();
    return this.getDataPin();
  }

  async verifyDataPin(pin: string) {
    await this.ensureConfigLoaded();
    return { valid: pin === this.config.dataPin };
  }

  private getDefaultDataPin(): string {
    const configured = this.configService.get<string>("DATA_PIN")?.trim() ?? "1234";
    return /^\d{4}$/.test(configured) ? configured : "1234";
  }

  async getWinners(query: WinnersQueryDto) {
    const limit = query.limit ?? 200;
    const offset = query.offset ?? 0;
    const placedAtFilter = this.buildPlacedAtFilter(query);
    const drawCountAsOfNow = await this.drawnNumberModel.countDocuments();

    const entryMatch: Record<string, unknown> = {};
    if (placedAtFilter) {
      entryMatch.placedAt = placedAtFilter;
    }
    if (query.status) {
      entryMatch.status = query.status;
    }
    const merchantFilter = normalizePhoneFilter(query.merchant);
    if (merchantFilter) {
      entryMatch.merchantId = { $regex: escapeRegex(merchantFilter), $options: "i" };
    }

    const phoneFilter = normalizePhoneFilter(query.phone) || normalizePhoneFilter(query.account);
    const phoneMatch = phoneFilter
      ? { "user.phone": { $regex: escapeRegex(phoneFilter), $options: "i" } }
      : null;

    const [aggregated] = await this.entryModel.aggregate<{
      meta: Array<{ total: number }>;
      items: AggregatedRecord[];
    }>([
      { $match: entryMatch },
      {
        $lookup: {
          from: this.userModel.collection.name,
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      ...(phoneMatch ? [{ $match: phoneMatch }] : []),
      { $sort: { placedAt: -1, _id: -1 } },
      {
        $facet: {
          meta: [{ $count: "total" }],
          items: [
            { $skip: offset },
            { $limit: limit },
            {
              $lookup: {
                from: this.payoutRecordModel.collection.name,
                localField: "_id",
                foreignField: "entryId",
                as: "payout",
              },
            },
            { $unwind: { path: "$payout", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 1,
                userId: 1,
                status: 1,
                ruleVersion: 1,
                placedAfterDrawCount: 1,
                placedAt: 1,
                phone: "$user.phone",
                merchantId: 1,
                numbers: 1,
                winningSequenceEndedAt: 1,
                settledAt: "$payout.settledAt",
                payoutKES: "$payout.payoutKES",
                jackpotBeforeSplitKES: "$payout.jackpotBeforeSplitKES",
                winnerCount: "$payout.winnerCount",
                settlementKey: "$payout.settlementKey",
              },
            },
          ],
        },
      },
    ]);

    const total = aggregated?.meta?.[0]?.total ?? 0;
    const items = (aggregated?.items ?? [])
      .map((item) => this.toRecordRow(item, drawCountAsOfNow))
      .map((item) => this.toListRow(item));

    return {
      total,
      limit,
      offset,
      items,
    };
  }

  async buildWinnersCsv(query: WinnersQueryDto): Promise<string> {
    const drawCountAsOfNow = await this.drawnNumberModel.countDocuments();
    const placedAtFilter = this.buildPlacedAtFilter(query);

    const entryMatch: Record<string, unknown> = {};
    if (placedAtFilter) {
      entryMatch.placedAt = placedAtFilter;
    }
    if (query.status) {
      entryMatch.status = query.status;
    }
    const merchantFilter = normalizePhoneFilter(query.merchant);
    if (merchantFilter) {
      entryMatch.merchantId = { $regex: escapeRegex(merchantFilter), $options: "i" };
    }

    const phoneFilter = normalizePhoneFilter(query.phone) || normalizePhoneFilter(query.account);
    const phoneMatch = phoneFilter
      ? { "user.phone": { $regex: escapeRegex(phoneFilter), $options: "i" } }
      : null;

    const rows = await this.entryModel.aggregate<AggregatedRecord>([
      { $match: entryMatch },
      {
        $lookup: {
          from: this.userModel.collection.name,
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      ...(phoneMatch ? [{ $match: phoneMatch }] : []),
      { $sort: { placedAt: -1, _id: -1 } },
      {
        $lookup: {
          from: this.payoutRecordModel.collection.name,
          localField: "_id",
          foreignField: "entryId",
          as: "payout",
        },
      },
      { $unwind: { path: "$payout", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          userId: 1,
          status: 1,
          ruleVersion: 1,
          placedAfterDrawCount: 1,
          placedAt: 1,
          phone: "$user.phone",
          merchantId: 1,
          numbers: 1,
          winningSequenceEndedAt: 1,
          settledAt: "$payout.settledAt",
          payoutKES: "$payout.payoutKES",
          jackpotBeforeSplitKES: "$payout.jackpotBeforeSplitKES",
          winnerCount: "$payout.winnerCount",
          settlementKey: "$payout.settlementKey",
        },
      },
    ]);

    const header = [
      "Phone",
      "Merchant",
      "Status",
      "Bet Number",
      "Bet Time",
      "Winning Time",
      "Payout KES",
      "Jackpot Before Split KES",
      "Winner Count",
      "Settled At",
    ];

    const lines = [header.join(",")];

    for (const row of rows.map((item) => this.toRecordRow(item, drawCountAsOfNow))) {
      lines.push([
        row.phone,
        row.merchant,
        row.status,
        formatBetNumberForCsv(row.betNumber),
        formatKenyaDateTimeFromIso(row.betTime),
        formatKenyaDateTimeFromIso(row.winningTime),
        String(row.payoutKES),
        String(row.jackpotBeforeSplitKES),
        String(row.winnerCount),
        formatKenyaDateTimeFromIso(row.settledAt),
      ].map(escapeCsvField).join(","));
    }

    return lines.join("\n");
  }

  async getDrawnNumbers(query: DrawnNumbersQueryDto) {
    const limit = query.limit ?? 200;
    const offset = query.offset ?? 0;
    const receivedAtFilter = this.buildReceivedAtFilter(query);

    const match: Record<string, unknown> = {};
    if (receivedAtFilter) {
      match.receivedAt = receivedAtFilter;
    }

    const [total, rows] = await Promise.all([
      this.drawnNumberModel.countDocuments(match),
      this.drawnNumberModel
        .find(match)
        .sort({ receivedAt: -1, _id: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
    ]);

    const items: DrawnNumberRow[] = rows.map((row) => ({
      id: String(row._id),
      number: String(row.number),
      dayKey: row.dayKey,
      receivedAt: row.receivedAt.toISOString(),
    }));

    return {
      total,
      limit,
      offset,
      items,
    };
  }

  async buildDrawnNumbersCsv(query: DrawnNumbersQueryDto): Promise<string> {
    const receivedAtFilter = this.buildReceivedAtFilter(query);

    const match: Record<string, unknown> = {};
    if (receivedAtFilter) {
      match.receivedAt = receivedAtFilter;
    }

    const rows = await this.drawnNumberModel
      .find(match)
      .sort({ receivedAt: -1, _id: -1 })
      .lean();

    const header = ["id", "number", "date", "receivedAt"];
    const lines = [header.join(",")];

    for (const row of rows) {
      lines.push([
        String(row._id),
        String(row.number),
        row.dayKey,
        formatKenyaDateTime(row.receivedAt),
      ].map(escapeCsvField).join(","));
    }

    return lines.join("\n");
  }

  private buildPlacedAtFilter(query: WinnersQueryDto): { $gte?: Date; $lte?: Date } | null {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    if (!from && !to) {
      return null;
    }

    const filter: { $gte?: Date; $lte?: Date } = {};
    if (from) {
      filter.$gte = from;
    }
    if (to) {
      filter.$lte = to;
    }
    return filter;
  }

  private buildReceivedAtFilter(query: DrawnNumbersQueryDto): { $gte?: Date; $lte?: Date } | null {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    if (!from && !to) {
      return null;
    }

    const filter: { $gte?: Date; $lte?: Date } = {};
    if (from) {
      filter.$gte = from;
    }
    if (to) {
      filter.$lte = to;
    }
    return filter;
  }

  private normalizeEntryStatus(status: string | undefined, ruleVersion?: string): string {
    if (status === "Expired" && ruleVersion === ENTRY_RULE_DRAW_WINDOW_V2) {
      return "Unmatched";
    }
    return status ?? "Pending";
  }

  private toRecordRow(item: AggregatedRecord, drawCountAsOfNow: number): RecordRow {
    const betNumber = Array.isArray(item.numbers)
      ? item.numbers.map((value) => String(value)).join("")
      : "";

    const isDrawWindowV2 = item.ruleVersion === ENTRY_RULE_DRAW_WINDOW_V2;
    const canComputeProgress = isDrawWindowV2 && typeof item.placedAfterDrawCount === "number";
    const drawsSincePlaced = canComputeProgress
      ? Math.max(0, drawCountAsOfNow - (item.placedAfterDrawCount as number))
      : null;
    const numbersUntilExpiry = canComputeProgress && typeof drawsSincePlaced === "number"
      ? Math.max(0, DRAW_WINDOW_EXPIRES_AFTER - drawsSincePlaced)
      : null;

    return {
      recordId: String(item._id),
      entryId: String(item._id),
      userId: String(item.userId),
      phone: item.phone ?? "",
      merchant: item.merchantId ?? "",
      status: this.normalizeEntryStatus(item.status, item.ruleVersion),
      ruleVersion: item.ruleVersion ?? "legacy_time_window",
      betNumber,
      betTime: item.placedAt.toISOString(),
      winningTime: item.winningSequenceEndedAt ? item.winningSequenceEndedAt.toISOString() : null,
      drawsSincePlaced,
      numbersUntilExpiry,
      validFromNumbersAfter: canComputeProgress ? DRAW_WINDOW_VALID_FROM_AFTER : null,
      expiresInNumbersAfter: canComputeProgress ? DRAW_WINDOW_EXPIRES_AFTER : null,
      payoutKES: item.payoutKES ?? 0,
      jackpotBeforeSplitKES: item.jackpotBeforeSplitKES ?? 0,
      winnerCount: item.winnerCount ?? 0,
      settlementKey: item.settlementKey ?? null,
      settledAt: item.settledAt ? item.settledAt.toISOString() : null,
    };
  }

  private toListRow(item: RecordRow) {
    return {
      recordId: item.recordId,
      phone: item.phone,
      merchant: item.merchant,
      status: item.status,
      ruleVersion: item.ruleVersion,
      betNumber: item.betNumber,
      betTime: item.betTime,
      winningTime: item.winningTime,
      drawsSincePlaced: item.drawsSincePlaced,
      numbersUntilExpiry: item.numbersUntilExpiry,
      validFromNumbersAfter: item.validFromNumbersAfter,
      expiresInNumbersAfter: item.expiresInNumbersAfter,
      payoutKES: item.payoutKES,
      jackpotBeforeSplitKES: item.jackpotBeforeSplitKES,
      winnerCount: item.winnerCount,
    };
  }
}
