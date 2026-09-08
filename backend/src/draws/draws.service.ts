import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { AdminService } from "../admin/admin.service";
import { ActionNotificationResult, CallbackResponse } from "../callbacks/callback.service";
import { User, UserDocument } from "../users/user.schema";
import { DrawCounter, DrawCounterDocument } from "./draw-counter.schema";
import { DrawDaySummary, DrawDaySummaryDocument } from "./draw-day-summary.schema";
import { DrawnNumber, DrawnNumberDocument } from "./drawn-number.schema";
import { Entry, EntryDocument, EntryRuleVersion, EntryStatus } from "./entry.schema";
import { JackpotState, JackpotStateDocument } from "./jackpot-state.schema";
import { PayoutRecord, PayoutRecordDocument } from "./payout-record.schema";

const KENYA_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3 (Africa/Nairobi)

function toKenyaDayKey(date: Date): string {
  return new Date(date.getTime() + KENYA_OFFSET_MS).toISOString().slice(0, 10);
}

function endOfKenyaDay(date: Date): Date {
  // 23:59:59.999 Kenya time (UTC+3) = T20:59:59.999Z on the same Kenya-local date
  const kenyaDateStr = toKenyaDayKey(date);
  return new Date(kenyaDateStr + "T20:59:59.999Z");
}

const JACKPOT_SCOPE = "global";
const DRAW_COUNTER_SCOPE = "global";
const JACKPOT_TEN_PERCENT_SPLIT_THRESHOLD_KES = 10_000;
const PUBLIC_HISTORY_CACHE_MS = 30_000;
const DRAW_COUNTER_CACHE_MS = 1_000;
const ENTRY_RULE_LEGACY: EntryRuleVersion = "legacy_time_window";
const ENTRY_RULE_DRAW_WINDOW_V2: EntryRuleVersion = "draw_window_v2";
const DRAW_WINDOW_VALID_FROM_AFTER = 4;
const DRAW_WINDOW_EXPIRES_AFTER = 53;

type PublicHistoryDay = {
  dayKey: string;
  numbers: number[];
  total: number;
  lastReceivedAt: Date;
};

function clampToNow(date: Date): Date {
  const now = new Date();
  return date.getTime() > now.getTime() ? now : date;
}

@Injectable()
export class DrawsService {
  private readonly logger = new Logger(DrawsService.name);
  private publicHistoryCache: { expiresAt: number; history: PublicHistoryDay[] } | null = null;
  private drawCounterCache: { expiresAt: number; counter: { totalDrawCount: number; lastReceivedAt?: Date } } | null = null;
  private backgroundEntryReconciliationPromise: Promise<void> | null = null;
  private backgroundEntryReconciliationPendingAsOf: Date | null = null;

  constructor(
    @InjectModel(DrawCounter.name) private readonly drawCounterModel: Model<DrawCounterDocument>,
    @InjectModel(DrawDaySummary.name) private readonly drawDaySummaryModel: Model<DrawDaySummaryDocument>,
    @InjectModel(DrawnNumber.name) private readonly drawnNumberModel: Model<DrawnNumberDocument>,
    @InjectModel(Entry.name) private readonly entryModel: Model<EntryDocument>,
    @InjectModel(JackpotState.name) private readonly jackpotStateModel: Model<JackpotStateDocument>,
    @InjectModel(PayoutRecord.name) private readonly payoutRecordModel: Model<PayoutRecordDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly adminService: AdminService,
  ) {}

  async getPublicState() {
    const now = new Date();
    await this.expireOldEntries(now);
    await this.accrueJackpotByTime(now);

    const runtimeConfig = await this.adminService.getGameRuntimeConfig();
    const missionThresholds = await this.adminService.getMissionThresholds();
    const today = toKenyaDayKey(now);
    const [todaySummary, latestTodayNumbers, historyByDay] = await Promise.all([
      this.drawDaySummaryModel.findOne({ dayKey: today }).lean(),
      this.drawnNumberModel
        .find({ dayKey: today, receivedAt: { $lte: now } })
        .sort({ receivedAt: -1 })
        .limit(20)
        .lean(),
      this.getPublicHistoryByDay(now),
    ]);
    const totalToday = todaySummary
      ? Math.max(0, todaySummary.total ?? 0)
      : await this.drawnNumberModel.countDocuments({ dayKey: today, receivedAt: { $lte: now } });
    const last20 = latestTodayNumbers
      .slice()
      .reverse();

    const jackpot = await this.getOrCreateJackpotState();

    return {
      youtubeVideoId: runtimeConfig.youtubeVideoId,
      jackpot: { amount: jackpot.currentAmountKES, currency: jackpot.currency },
      missionThresholds: {
        turnoverMissionThreshold:
          missionThresholds.pendingTurnoverMissionThreshold ?? missionThresholds.turnoverMissionThreshold,
        depositMissionThreshold:
          missionThresholds.pendingDepositMissionThreshold ?? missionThresholds.depositMissionThreshold,
      },
      draw: {
        stream: last20.map((d) => ({ number: d.number, receivedAt: d.receivedAt })),
        totalToday,
        dayKey: today,
        history: historyByDay.map((item) => ({
          dayKey: item.dayKey,
          numbers: item.numbers,
          total: item.total,
          lastReceivedAt: item.lastReceivedAt,
        })),
      },
      resultPolicy: {
        nonWinningTerminalStatus: "Unmatched",
        payoutRemainderPolicy: "platform_retained",
        realtimeMode: runtimeConfig.realtimeMode,
        pollingIntervalSeconds: runtimeConfig.pollingIntervalSeconds,
        jackpotIncrementAmount: runtimeConfig.jackpotIncrementAmount,
        liveOverlayEnabled: runtimeConfig.liveOverlayEnabled,
        otpEnabled: false,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  async pushNumber(number: number, timestamp: string, createdAtMs?: number) {
    if (!Number.isInteger(number) || number < 0 || number > 9) {
      throw new BadRequestException("Number must be an integer 0–9.");
    }
    const parsedReceivedAt = Number.isFinite(createdAtMs)
      ? new Date(createdAtMs as number)
      : (timestamp ? new Date(timestamp) : new Date());
    if (isNaN(parsedReceivedAt.getTime())) {
      throw new BadRequestException("Invalid Timestamp format.");
    }
    const receivedAt = clampToNow(parsedReceivedAt);
    const dayKey = toKenyaDayKey(receivedAt);
    const saved = await this.drawnNumberModel.create({ number, receivedAt, dayKey });
    await Promise.all([
      this.drawCounterModel.findOneAndUpdate(
        { scope: DRAW_COUNTER_SCOPE },
        {
          $setOnInsert: { scope: DRAW_COUNTER_SCOPE },
          $inc: { totalDrawCount: 1 },
          $max: { lastReceivedAt: receivedAt },
        },
        { upsert: true, new: true },
      ),
      this.drawDaySummaryModel.updateOne(
        { dayKey },
        {
          $setOnInsert: { dayKey },
          $inc: { total: 1 },
          $max: { lastReceivedAt: receivedAt },
        },
        { upsert: true },
      ),
    ]);

    this.drawCounterCache = null;
    this.publicHistoryCache = null;
    this.logger.log(`Pushed ${number} at ${receivedAt.toISOString()} (day=${dayKey})`);
    await this.accrueJackpotByTime(receivedAt);
    this.queueEntryReconciliation(receivedAt);

    return { id: saved._id.toString(), number, receivedAt: saved.receivedAt, dayKey };
  }

  private queueEntryReconciliation(asOf: Date): void {
    this.backgroundEntryReconciliationPendingAsOf = asOf;

    if (this.backgroundEntryReconciliationPromise) {
      return;
    }

    this.backgroundEntryReconciliationPromise = (async () => {
      while (this.backgroundEntryReconciliationPendingAsOf) {
        const nextAsOf = this.backgroundEntryReconciliationPendingAsOf;
        this.backgroundEntryReconciliationPendingAsOf = null;
        await Promise.allSettled([this.expireOldEntries(nextAsOf), this.settleEntries(nextAsOf)]);
      }
    })().finally(() => {
      this.backgroundEntryReconciliationPromise = null;
    });
  }

  private async getPublicHistoryByDay(now: Date): Promise<PublicHistoryDay[]> {
    const cached = this.publicHistoryCache;
    if (cached && cached.expiresAt > now.getTime()) {
      return cached.history;
    }

    const history = await this.drawnNumberModel.aggregate<{
      _id: string;
      numbers: number[];
      total: number;
      lastReceivedAt: Date;
    }>([
      { $sort: { dayKey: 1, receivedAt: 1 } },
      {
        $group: {
          _id: "$dayKey",
          numbers: { $push: "$number" },
          total: { $sum: 1 },
          lastReceivedAt: { $last: "$receivedAt" },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 20 },
    ]);

    const normalizedHistory = history.map((item) => ({
      dayKey: item._id,
      numbers: item.numbers,
      total: item.total,
      lastReceivedAt: item.lastReceivedAt,
    }));

    this.publicHistoryCache = {
      expiresAt: now.getTime() + PUBLIC_HISTORY_CACHE_MS,
      history: normalizedHistory,
    };

    return normalizedHistory;
  }

  async createEntry(userId: string, numbers: number[], merchantId?: string) {
    if (!Array.isArray(numbers) || numbers.length !== 4) {
      throw new BadRequestException("Please provide exactly 4 numbers.");
    }
    const now = new Date();
    const placedAfterDrawCount = await this.getDrawCountAsOf(now);
    const validFrom = new Date(now.getTime() + 5 * 60 * 1000);
    const expiresAt = endOfKenyaDay(now);

    const entry = await this.entryModel.create({
      userId: new Types.ObjectId(userId),
      numbers,
      placedAt: now,
      validFrom,
      expiresAt,
      status: "Pending" as EntryStatus,
      ruleVersion: ENTRY_RULE_DRAW_WINDOW_V2,
      placedAfterDrawCount,
      merchantId,
      callbackStatus: merchantId ? "pending" : undefined,
    });

    this.queueEntryReconciliation(now);

    const refreshedEntry = await this.entryModel.findById(entry._id).lean();
    const drawCountAsOfNow = await this.getDrawCountAsOf(now);
    const progress = this.buildEntryProgress(
      {
        ruleVersion: refreshedEntry?.ruleVersion ?? entry.ruleVersion,
        placedAfterDrawCount: refreshedEntry?.placedAfterDrawCount ?? entry.placedAfterDrawCount,
      },
      drawCountAsOfNow,
    );

    return {
      id: entry._id.toString(),
      numbers: refreshedEntry?.numbers ?? entry.numbers,
      status: this.normalizeEntryStatus({
        status: refreshedEntry?.status ?? entry.status,
        ruleVersion: refreshedEntry?.ruleVersion ?? entry.ruleVersion,
      }),
      ruleVersion: refreshedEntry?.ruleVersion ?? entry.ruleVersion,
      drawsSincePlaced: progress.drawsSincePlaced,
      numbersUntilExpiry: progress.numbersUntilExpiry,
      validFromNumbersAfter: progress.validFromNumbersAfter,
      expiresInNumbersAfter: progress.expiresInNumbersAfter,
      placedAt: (refreshedEntry?.placedAt ?? entry.placedAt).toISOString(),
      validFrom: (refreshedEntry?.validFrom ?? entry.validFrom).toISOString(),
      expiresAt: (refreshedEntry?.expiresAt ?? entry.expiresAt).toISOString(),
    };
  }

  async updateEntryWithCallbackResponse(entryId: string, response: CallbackResponse) {
    if (!Types.ObjectId.isValid(entryId)) {
      return;
    }

    let callbackStatus: "success" | "abnormal";
    const callbackMessage = typeof response.message === "string" && response.message.trim().length > 0
      ? response.message
      : undefined;

    if (!response.actionId) {
      callbackStatus = "abnormal";
    } else {
      callbackStatus = response.success === true && response.error !== true ? "success" : "abnormal";
    }

    await this.entryModel.updateOne(
      { _id: new Types.ObjectId(entryId) },
      {
        $set: {
          callbackStatus,
          callbackSentAt: new Date(),
          callbackActionId: response.actionId,
          callbackSuccess: response.success,
          callbackError: response.error,
          callbackMessage,
        },
      },
    );
  }

  async updateEntryWithWinningNotificationResult(
    entryId: string,
    result: ActionNotificationResult,
    status: "success" | "abnormal",
    message?: string,
  ) {
    if (!Types.ObjectId.isValid(entryId)) {
      return;
    }

    await this.entryModel.updateOne(
      { _id: new Types.ObjectId(entryId) },
      {
        $set: {
          callbackStatus: status,
          callbackSentAt: new Date(),
          callbackSuccess: result.ok,
          callbackError: !result.ok,
          callbackMessage: message ?? result.message,
        },
      },
    );
  }

  async getEntriesForUser(userId: string) {
    const now = new Date();
    await this.expireOldEntries(now);
    await this.settleEntries(now);
    const drawCountAsOfNow = await this.getDrawCountAsOf(now);

    const entries = await this.entryModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const entryIds = entries.map((entry) => entry._id);
    const payouts = entryIds.length
      ? await this.payoutRecordModel.find({ entryId: { $in: entryIds } }).lean()
      : [];
    const payoutByEntryId = new Map<string, number>();

    for (const payout of payouts) {
      payoutByEntryId.set(payout.entryId.toString(), payout.payoutKES);
    }

    return entries.map((entry) => ({
      ...this.buildEntryProgress(entry, drawCountAsOfNow),
      payoutKES: payoutByEntryId.get(entry._id.toString()) ?? null,
      id: entry._id.toString(),
      numbers: entry.numbers,
      status: this.normalizeEntryStatus(entry),
      ruleVersion: entry.ruleVersion ?? ENTRY_RULE_LEGACY,
      merchantId: entry.merchantId ?? null,
      callbackStatus: entry.callbackStatus ?? null,
      callbackActionId: entry.callbackActionId ?? null,
      callbackSuccess: typeof entry.callbackSuccess === "boolean" ? entry.callbackSuccess : null,
      callbackError: typeof entry.callbackError === "boolean" ? entry.callbackError : null,
      callbackMessage: entry.callbackMessage ?? null,
      callbackSentAt: entry.callbackSentAt?.toISOString() ?? null,
      placedAt: entry.placedAt.toISOString(),
      validFrom: entry.validFrom.toISOString(),
      expiresAt: entry.expiresAt.toISOString(),
      settledAt: entry.settledAt?.toISOString() ?? null,
      winningSequenceEndedAt: entry.winningSequenceEndedAt?.toISOString() ?? null,
      createdAt: (entry as unknown as { createdAt?: Date }).createdAt?.toISOString() ?? null,
    }));
  }

  private normalizeEntryStatus(entry: { status?: EntryStatus; ruleVersion?: EntryRuleVersion }) {
    if (entry.status === "Expired" && entry.ruleVersion === ENTRY_RULE_DRAW_WINDOW_V2) {
      return "Unmatched" as EntryStatus;
    }
    return entry.status ?? "Pending";
  }

  private buildEntryProgress(
    entry: { ruleVersion?: EntryRuleVersion; placedAfterDrawCount?: number },
    drawCountAsOf: number,
  ) {
    const isDrawWindowV2 = entry.ruleVersion === ENTRY_RULE_DRAW_WINDOW_V2;
    if (!isDrawWindowV2 || typeof entry.placedAfterDrawCount !== "number") {
      return {
        drawsSincePlaced: null,
        numbersUntilExpiry: null,
        validFromNumbersAfter: null,
        expiresInNumbersAfter: null,
      };
    }

    const drawsSincePlaced = Math.max(0, drawCountAsOf - entry.placedAfterDrawCount);
    return {
      drawsSincePlaced,
      numbersUntilExpiry: Math.max(0, DRAW_WINDOW_EXPIRES_AFTER - drawsSincePlaced),
      validFromNumbersAfter: DRAW_WINDOW_VALID_FROM_AFTER,
      expiresInNumbersAfter: DRAW_WINDOW_EXPIRES_AFTER,
    };
  }

  async getWalletCreditsForUser(userId: string) {
    const payouts = await this.payoutRecordModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ settledAt: -1 })
      .limit(50)
      .lean();

    return payouts.map((payout) => ({
      id: payout._id.toString(),
      entryId: payout.entryId.toString(),
      settlementKey: payout.settlementKey,
      jackpotBeforeSplitKES: payout.jackpotBeforeSplitKES,
      winnerCount: payout.winnerCount,
      payoutKES: payout.payoutKES,
      settledAt: payout.settledAt.toISOString(),
      currency: "KES",
    }));
  }

  private async settleEntries(asOf: Date): Promise<number> {
    const legacyCandidates = await this.entryModel.find({
      status: "Pending",
      $or: [
        { ruleVersion: { $exists: false } },
        { ruleVersion: ENTRY_RULE_LEGACY },
      ],
      validFrom: { $lte: asOf },
      expiresAt: { $gte: asOf },
    });
    let settledWinnerCount = 0;

    if (legacyCandidates.length > 0) {
      const minValidFrom = legacyCandidates.reduce((min, entry) => {
        return entry.validFrom < min ? entry.validFrom : min;
      }, legacyCandidates[0].validFrom);

      const allNumbers = await this.drawnNumberModel
        .find({
          receivedAt: {
            $gte: minValidFrom,
            $lte: asOf,
          },
        })
        .sort({ receivedAt: 1, _id: 1 })
        .lean();

      const winnersBySettlement = new Map<string, { matchedAt: Date; entries: EntryDocument[] }>();

      for (const entry of legacyCandidates) {
        const entryValidFrom = new Date(entry.validFrom);
        const entryExpiresAt = new Date(entry.expiresAt);
        const eligible = allNumbers.filter((d) => {
          const t = new Date(d.receivedAt);
          return t >= entryValidFrom && t <= entryExpiresAt;
        });

        const matchedAt = this.findMatchEndTime(
          eligible,
          entry.numbers,
          0,
          1,
        );
        if (matchedAt) {
          const settlementKey = matchedAt.toISOString();
          if (!winnersBySettlement.has(settlementKey)) {
            winnersBySettlement.set(settlementKey, { matchedAt, entries: [] });
          }
          winnersBySettlement.get(settlementKey)?.entries.push(entry);
        }
      }

      const winningGroups = Array.from(winnersBySettlement.values()).sort(
        (a, b) => a.matchedAt.getTime() - b.matchedAt.getTime(),
      );

      for (const group of winningGroups) {
        const settledInGroup = await this.settleWinningGroup(group.entries, group.matchedAt);
        settledWinnerCount += settledInGroup;
      }
    }

    settledWinnerCount += await this.settleDrawWindowV2Entries(asOf);

    return settledWinnerCount;
  }

  private async settleDrawWindowV2Entries(asOf: Date): Promise<number> {
    const totalDrawCount = await this.getDrawCountAsOf(asOf);
    if (totalDrawCount < DRAW_WINDOW_VALID_FROM_AFTER) {
      return 0;
    }

    const minPlacedAfter = Math.max(0, totalDrawCount - DRAW_WINDOW_EXPIRES_AFTER);
    const maxPlacedAfter = Math.max(0, totalDrawCount - DRAW_WINDOW_VALID_FROM_AFTER);
    const candidates = await this.entryModel.find({
      status: "Pending",
      ruleVersion: ENTRY_RULE_DRAW_WINDOW_V2,
      placedAfterDrawCount: {
        $gte: minPlacedAfter,
        $lte: maxPlacedAfter,
      },
    });

    if (candidates.length === 0) {
      return 0;
    }

    const minCandidatePlacedAfter = candidates.reduce((min, entry) => {
      const currentPlacedAfter = typeof entry.placedAfterDrawCount === "number" ? entry.placedAfterDrawCount : totalDrawCount;
      return Math.min(min, currentPlacedAfter);
    }, totalDrawCount);

    const allNumbersFromCandidates = await this.drawnNumberModel
      .find({ receivedAt: { $lte: asOf } })
      .sort({ receivedAt: 1, _id: 1 })
      .skip(minCandidatePlacedAfter)
      .lean();

    const winnersBySettlement = new Map<string, { matchedAt: Date; entries: EntryDocument[] }>();

    for (const entry of candidates) {
      if (typeof entry.placedAfterDrawCount !== "number") {
        continue;
      }
      const start = entry.placedAfterDrawCount - minCandidatePlacedAfter;
      if (start < 0 || start >= allNumbersFromCandidates.length) {
        continue;
      }
      const eligible = allNumbersFromCandidates.slice(start, start + DRAW_WINDOW_EXPIRES_AFTER);
      if (eligible.length < DRAW_WINDOW_VALID_FROM_AFTER) {
        continue;
      }

      const matchedAt = this.findDrawWindowV2MatchEndTime(eligible, entry.numbers);
      if (!matchedAt) {
        continue;
      }

      const settlementKey = matchedAt.toISOString();
      if (!winnersBySettlement.has(settlementKey)) {
        winnersBySettlement.set(settlementKey, { matchedAt, entries: [] });
      }
      winnersBySettlement.get(settlementKey)?.entries.push(entry);
    }

    const winningGroups = Array.from(winnersBySettlement.values()).sort(
      (a, b) => a.matchedAt.getTime() - b.matchedAt.getTime(),
    );

    let settledWinnerCount = 0;

    for (const group of winningGroups) {
      const settledInGroup = await this.settleWinningGroup(group.entries, group.matchedAt);
      settledWinnerCount += settledInGroup;
    }

    return settledWinnerCount;
  }

  private async expireOldEntries(asOf: Date) {
    await this.entryModel.updateMany(
      {
        status: "Pending",
        expiresAt: { $lt: asOf },
        $or: [
          { ruleVersion: { $exists: false } },
          { ruleVersion: { $ne: ENTRY_RULE_DRAW_WINDOW_V2 } },
        ],
      },
      { $set: { status: "Expired", settledAt: new Date() } },
    );

    const totalDrawCount = await this.getDrawCountAsOf(asOf);
    const expireThresholdPlacedAfter = totalDrawCount - (DRAW_WINDOW_EXPIRES_AFTER + 1);
    if (expireThresholdPlacedAfter >= 0) {
      await this.entryModel.updateMany(
        {
          status: "Pending",
          ruleVersion: ENTRY_RULE_DRAW_WINDOW_V2,
          placedAfterDrawCount: { $lte: expireThresholdPlacedAfter },
        },
        { $set: { status: "Unmatched", settledAt: new Date() } },
      );
    }
  }

  private async getDrawCountAsOf(asOf: Date): Promise<number> {
    const counter = await this.getDrawCounterSnapshot();
    if (counter && counter.lastReceivedAt && asOf.getTime() >= counter.lastReceivedAt.getTime()) {
      return Math.max(0, counter.totalDrawCount);
    }

    return this.drawnNumberModel.countDocuments({ receivedAt: { $lte: asOf } });
  }

  private async getDrawCounterSnapshot(): Promise<{ totalDrawCount: number; lastReceivedAt?: Date } | null> {
    const now = Date.now();
    if (this.drawCounterCache && this.drawCounterCache.expiresAt > now) {
      return this.drawCounterCache.counter;
    }

    const counter = await this.drawCounterModel
      .findOne({ scope: DRAW_COUNTER_SCOPE })
      .select({ _id: 0, totalDrawCount: 1, lastReceivedAt: 1 })
      .lean();

    if (!counter) {
      return null;
    }

    const snapshot = {
      totalDrawCount: Math.max(0, counter.totalDrawCount ?? 0),
      lastReceivedAt: counter.lastReceivedAt,
    };

    this.drawCounterCache = {
      expiresAt: now + DRAW_COUNTER_CACHE_MS,
      counter: snapshot,
    };

    return snapshot;
  }

  private containsConsecutive(haystack: number[], needle: number[]): boolean {
    if (needle.length > haystack.length) return false;
    for (let i = 0; i <= haystack.length - needle.length; i++) {
      if (needle.every((v, j) => haystack[i + j] === v)) return true;
    }
    return false;
  }

  private async settleWinningGroup(entries: EntryDocument[], matchedAt: Date): Promise<number> {
    if (entries.length === 0) {
      return 0;
    }

    const settlementKey = matchedAt.toISOString();
    const session = await this.entryModel.db.startSession();

    try {
      let settledCount = 0;
      await session.withTransaction(async () => {
        settledCount = await this.applySettlement(entries, matchedAt, settlementKey, session);
      });

      return settledCount;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const transactionNotSupported = message.includes("Transaction numbers are only allowed on a replica set member or mongos");

      if (!transactionNotSupported) {
        throw error;
      }

      this.logger.warn("Mongo transactions unavailable; falling back to non-transaction settlement mode.");
      return this.applySettlement(entries, matchedAt, settlementKey);
    } finally {
      await session.endSession();
    }
  }

  private async applySettlement(
    entries: EntryDocument[],
    matchedAt: Date,
    settlementKey: string,
    session?: unknown,
  ): Promise<number> {
    const alreadySettledQuery = this.payoutRecordModel.countDocuments({ settlementKey });
    const alreadySettled = session
      ? await alreadySettledQuery.session(session as never)
      : await alreadySettledQuery;

    if (alreadySettled > 0) {
      return 0;
    }

    const entryIds = entries.map((entry) => entry._id);
    const now = new Date();

    await this.entryModel.updateMany(
      { _id: { $in: entryIds }, status: "Pending" },
      { $set: { status: "Won", settledAt: now, winningSequenceEndedAt: matchedAt } },
      session ? { session: session as never } : undefined,
    );

    const winnersQuery = this.entryModel.find({
      _id: { $in: entryIds },
      status: "Won",
      winningSequenceEndedAt: matchedAt,
    });
    const winners = session
      ? await winnersQuery.session(session as never)
      : await winnersQuery;

    if (winners.length === 0) {
      return 0;
    }

    const jackpotQuery = this.jackpotStateModel.findOneAndUpdate(
      { scope: JACKPOT_SCOPE },
      { $setOnInsert: { scope: JACKPOT_SCOPE, currentAmountKES: 0, currency: "KES" } },
      session ? { new: true, upsert: true, session: session as never } : { new: true, upsert: true },
    );
    const jackpot = await jackpotQuery;

    const winnerCount = winners.length;
    const jackpotBeforeSplitKES = jackpot.currentAmountKES;
    const jackpotSplitDivisor =
      jackpotBeforeSplitKES > JACKPOT_TEN_PERCENT_SPLIT_THRESHOLD_KES ? 10 : 1;
    const payoutKES = Math.floor(jackpotBeforeSplitKES / winnerCount / jackpotSplitDivisor);

    if (payoutKES > 0) {
      const winnerUserIds = winners.map((entry) => entry.userId);
      await this.userModel.updateMany(
        { _id: { $in: winnerUserIds } },
        { $inc: { walletBalanceKES: payoutKES } },
        session ? { session: session as never } : undefined,
      );
    }

    const payoutRows = winners.map((winner) => ({
      entryId: winner._id,
      userId: winner.userId,
      settlementKey,
      jackpotBeforeSplitKES,
      winnerCount,
      payoutKES,
      settledAt: now,
    }));

    if (session) {
      await this.payoutRecordModel.insertMany(payoutRows, { session: session as never });
    } else {
      await this.payoutRecordModel.insertMany(payoutRows);
    }

    await this.notifyWinningEntries(winners);

    await this.jackpotStateModel.updateOne(
      { scope: JACKPOT_SCOPE },
      {
        $set: {
          currentAmountKES: 0,
          lastSettledAt: now,
          lastSettlementKey: settlementKey,
          lastAccumulatedAt: clampToNow(matchedAt),
        },
      },
      session ? { session: session as never } : undefined,
    );

    for (const winner of winners) {
      this.logger.log(`Entry ${winner._id.toString()} WON: ${winner.numbers.join("")} (payout=${payoutKES} KES)`);
    }

    return winners.length;
  }

  private async notifyWinningEntries(winners: EntryDocument[]): Promise<void> {
    await Promise.all(
      winners.map(async (winner) => {
        await this.updateEntryWithWinningNotificationResult(
          winner._id.toString(),
          {
            ok: true,
            statusCode: 200,
            message: "winning notification skipped by policy",
          },
          "success",
          "winning notification skipped by policy",
        );
      }),
    );
  }

  private async getOrCreateJackpotState(): Promise<JackpotStateDocument> {
    return this.jackpotStateModel.findOneAndUpdate(
      { scope: JACKPOT_SCOPE },
      {
        $setOnInsert: {
          scope: JACKPOT_SCOPE,
          currentAmountKES: 0,
          currency: "KES",
          lastAccumulatedAt: new Date(),
        },
      },
      { new: true, upsert: true },
    );
  }

  private async accrueJackpotByTime(asOf: Date): Promise<void> {
    const effectiveAsOf = clampToNow(asOf);
    const runtimeConfig = await this.adminService.getGameRuntimeConfig();
    const incrementPerSecond = Math.max(0, Math.floor(runtimeConfig.jackpotIncrementAmount ?? 0));

    if (incrementPerSecond <= 0) {
      return;
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const jackpot = await this.getOrCreateJackpotState();
      if (!jackpot.lastAccumulatedAt) {
        const initialized = await this.jackpotStateModel.updateOne(
          { scope: JACKPOT_SCOPE, lastAccumulatedAt: { $exists: false } },
          { $set: { lastAccumulatedAt: effectiveAsOf } },
        );

        if (initialized.modifiedCount === 1) {
          return;
        }

        continue;
      }

      // Self-heal a future timestamp so jackpot can continue to grow.
      if (jackpot.lastAccumulatedAt.getTime() > effectiveAsOf.getTime()) {
        await this.jackpotStateModel.updateOne(
          { scope: JACKPOT_SCOPE, lastAccumulatedAt: jackpot.lastAccumulatedAt },
          { $set: { lastAccumulatedAt: effectiveAsOf } },
        );
        continue;
      }

      const elapsedMs = effectiveAsOf.getTime() - jackpot.lastAccumulatedAt.getTime();
      const elapsedSeconds = Math.floor(elapsedMs / 1000);
      if (elapsedSeconds <= 0) {
        return;
      }

      const deltaKES = elapsedSeconds * incrementPerSecond;
      const nextAccumulatedAt = new Date(
        jackpot.lastAccumulatedAt.getTime() + elapsedSeconds * 1000,
      );

      const updated = await this.jackpotStateModel.updateOne(
        { scope: JACKPOT_SCOPE, lastAccumulatedAt: jackpot.lastAccumulatedAt },
        {
          $inc: { currentAmountKES: deltaKES },
          $set: { lastAccumulatedAt: nextAccumulatedAt },
        },
      );

      if (updated.modifiedCount === 1) {
        return;
      }
    }
  }

  private findMatchEndTime(
    eligible: { number: number; receivedAt: Date }[],
    needle: number[],
    firstStartIndex = 0,
    step = 1,
  ): Date | undefined {
    for (let i = firstStartIndex; i + needle.length <= eligible.length; i += step) {
      if (needle.every((v, j) => eligible[i + j].number === v)) {
        return eligible[i + needle.length - 1].receivedAt;
      }
    }

    return undefined;
  }

  private findDrawWindowV2MatchEndTime(
    eligible: { number: number; receivedAt: Date }[],
    needle: number[],
  ): Date | undefined {
    if (eligible.length < DRAW_WINDOW_VALID_FROM_AFTER) {
      return undefined;
    }

    const firstFourMatch = this.findMatchEndTime(eligible, needle, 0, 1);
    if (firstFourMatch) {
      return firstFourMatch;
    }

    return this.findMatchEndTime(eligible, needle, DRAW_WINDOW_VALID_FROM_AFTER, 1);
  }
}
