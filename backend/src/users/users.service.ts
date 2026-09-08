import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { AdminConfig, AdminConfigDocument } from "../admin/admin-config.schema";
import { CallbackResponse } from "../callbacks/callback.service";
import { DrawnNumber, DrawnNumberDocument } from "../draws/drawn-number.schema";
import { User, UserDocument } from "./user.schema";

const KENYA_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3 (Africa/Nairobi)
const DEPOSIT_NORMALIZATION_DIVISOR = 0.95;
const PLACE_BET_COUNT_THRESHOLD = 1;
const DEFAULT_TURNOVER_MISSION_THRESHOLD = 1000;
const DEFAULT_DEPOSIT_MISSION_THRESHOLD = 99;
const SUPER_ADMIN_DEFAULT_PERMISSIONS = ["admin:access", "draw:manage", "live:manage", "users:read", "data:read"];
const DATA_ADMIN_DEFAULT_PERMISSIONS = ["data:read"];

type MissionDayKeyField =
  | "loginMissionCompletedDayKey"
  | "placeBetMissionCompletedDayKey"
  | "turnoverMissionCompletedDayKey"
  | "depositMissionCompletedDayKey"
  | "completeAllMissionCompletedDayKey";

type MissionReceivedDayKeyField =
  | "loginMissionReceivedDayKey"
  | "inviteMissionReceivedDayKey"
  | "placeBetMissionReceivedDayKey"
  | "turnoverMissionReceivedDayKey"
  | "depositMissionReceivedDayKey"
  | "completeAllMissionReceivedDayKey";

export type MissionStatusSnapshot = {
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
};

export type MissionClaimResult = {
  success: boolean;
  message: string;
  missionId: number;
};

export type DailyBetAllowanceSnapshot = {
  dayKey: string;
  total: number;
  used: number;
  remaining: number;
  highestGranted: number;
};

export type ConsumeDailyBetAllowanceResult = {
  ok: boolean;
  snapshot: DailyBetAllowanceSnapshot;
};

export type InviteSuccessResult = {
  success: boolean;
  rewardGranted: boolean;
  phone: string;
  message?: string;
  dailyBetAllowanceTotal?: number;
  dailyBetAllowanceUsed?: number;
  dailyBetAllowanceRemaining?: number;
  inviteMissionCompletedToday?: boolean;
  inviteRewardGrantedCount?: number;
};

type MissionThresholds = {
  turnoverMissionThreshold: number;
  depositMissionThreshold: number;
};

function toKenyaDayKey(date: Date): string {
  return new Date(date.getTime() + KENYA_OFFSET_MS).toISOString().slice(0, 10);
}

function parseAmount(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDepositAmount(rawDepositAmount: string): string | undefined {
  const parsed = Number(rawDepositAmount);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return (parsed / DEPOSIT_NORMALIZATION_DIVISOR).toFixed(2);
}

function missionIdToReceivedField(missionId: number): MissionReceivedDayKeyField | null {
  if (missionId === 1) {
    return "loginMissionReceivedDayKey";
  }
  if (missionId === 2) {
    return "inviteMissionReceivedDayKey";
  }
  if (missionId === 3) {
    return "depositMissionReceivedDayKey";
  }
  if (missionId === 4) {
    return "placeBetMissionReceivedDayKey";
  }
  if (missionId === 5) {
    return "turnoverMissionReceivedDayKey";
  }
  if (missionId === 6) {
    return "completeAllMissionReceivedDayKey";
  }
  return null;
}

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly configKey = "runtime";

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(DrawnNumber.name) private readonly drawnNumberModel: Model<DrawnNumberDocument>,
    @InjectModel(AdminConfig.name) private readonly adminConfigModel: Model<AdminConfigDocument>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const strictMode =
      (this.configService.get<string>("BOOTSTRAP_STRICT_MODE") ?? "false") === "true";

    try {
      await this.ensureSuperAdmin();
      await this.ensureDataAdmin();
    } catch (error) {
      if (strictMode) {
        throw error;
      }

      // In lax mode, backend startup continues even if bootstrap checks fail.
      console.warn("[UsersService] Super admin bootstrap skipped:", error);
    }
  }

  async ensureSuperAdmin(): Promise<void> {
    const phone = this.configService.get<string>("SUPER_ADMIN_PHONE") ?? "+254700000001";
    const password = this.configService.get<string>("SUPER_ADMIN_PASSWORD") ?? "ChangeMe123!";
    const passwordHash = await bcrypt.hash(password, 10);

    const existing = await this.userModel.findOne({ role: "super_admin" });
    if (existing) {
      const mergedPermissions = Array.from(new Set([...(existing.permissions ?? []), ...SUPER_ADMIN_DEFAULT_PERMISSIONS]));
      const needsPermissionUpdate = mergedPermissions.length !== (existing.permissions ?? []).length;
      const needsPasswordUpdate = !(await bcrypt.compare(password, existing.passwordHash));

      if (needsPermissionUpdate || needsPasswordUpdate || existing.phone !== phone) {
        existing.phone = phone;
        existing.passwordHash = passwordHash;
        existing.permissions = mergedPermissions;
        existing.authProvider = "local";
        existing.localPasswordEnabled = true;
        await existing.save();
      }

      return;
    }

    await this.userModel.create({
      phone,
      passwordHash,
      authProvider: "local",
      localPasswordEnabled: true,
      role: "super_admin",
      permissions: SUPER_ADMIN_DEFAULT_PERMISSIONS,
      walletBalanceKES: 0,
      walletCurrency: "KES",
      depositAmount: "0.00",
      betAmount: "0.00",
      dailyBetAllowanceTotal: 0,
      dailyBetAllowanceBaseTotal: 0,
      dailyBetAllowanceUsed: 0,
      dailyBetAllowanceHighestGranted: 0,
    });
  }

  async ensureDataAdmin(): Promise<void> {
    const phone = this.configService.get<string>("DATA_ADMIN_PHONE") ?? "+254700000002";
    const password = this.configService.get<string>("DATA_ADMIN_PASSWORD") ?? "ChangeMe123!";
    const passwordHash = await bcrypt.hash(password, 10);

    const existingByPhone = await this.userModel.findOne({ phone, authProvider: "local" });
    if (existingByPhone) {
      const mergedPermissions = Array.from(new Set([...(existingByPhone.permissions ?? []), ...DATA_ADMIN_DEFAULT_PERMISSIONS]));
      const needsRoleUpdate = existingByPhone.role !== "data_admin";
      const needsPermissionUpdate = mergedPermissions.length !== (existingByPhone.permissions ?? []).length;
      const needsPasswordUpdate = !(await bcrypt.compare(password, existingByPhone.passwordHash));

      if (needsRoleUpdate || needsPermissionUpdate || needsPasswordUpdate) {
        existingByPhone.role = "data_admin";
        existingByPhone.passwordHash = passwordHash;
        existingByPhone.permissions = mergedPermissions;
        existingByPhone.authProvider = "local";
        existingByPhone.localPasswordEnabled = true;
        await existingByPhone.save();
      }

      return;
    }

    await this.userModel.create({
      phone,
      passwordHash,
      authProvider: "local",
      localPasswordEnabled: true,
      role: "data_admin",
      permissions: DATA_ADMIN_DEFAULT_PERMISSIONS,
      walletBalanceKES: 0,
      walletCurrency: "KES",
      depositAmount: "0.00",
      betAmount: "0.00",
      dailyBetAllowanceTotal: 0,
      dailyBetAllowanceBaseTotal: 0,
      dailyBetAllowanceUsed: 0,
      dailyBetAllowanceHighestGranted: 0,
    });
  }

  async findById(userId: string): Promise<UserDocument | null> {
    if (!Types.ObjectId.isValid(userId)) {
      return null;
    }
    return this.userModel.findById(new Types.ObjectId(userId));
  }

  async findByPhone(phone: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ phone });
  }

  async createPlayer(phone: string, password: string): Promise<UserDocument> {
    const passwordHash = await bcrypt.hash(password, 10);
    return this.userModel.create({
      phone,
      passwordHash,
      authProvider: "local",
      localPasswordEnabled: true,
      role: "player",
      permissions: [],
      walletBalanceKES: 0,
      walletCurrency: "KES",
      depositAmount: "0.00",
      betAmount: "0.00",
      dailyBetAllowanceTotal: 0,
      dailyBetAllowanceBaseTotal: 0,
      dailyBetAllowanceUsed: 0,
      dailyBetAllowanceHighestGranted: 0,
      inviteRewardGrantedCount: 0,
    });
  }

  async createExternalPlayer(phone: string): Promise<UserDocument> {
    const placeholderPassword = randomBytes(24).toString("hex");
    const passwordHash = await bcrypt.hash(placeholderPassword, 10);

    return this.userModel.create({
      phone,
      passwordHash,
      authProvider: "external",
      localPasswordEnabled: false,
      role: "player",
      permissions: [],
      walletBalanceKES: 0,
      walletCurrency: "KES",
      depositAmount: "0.00",
      betAmount: "0.00",
      dailyBetAllowanceTotal: 0,
      dailyBetAllowanceBaseTotal: 0,
      dailyBetAllowanceUsed: 0,
      dailyBetAllowanceHighestGranted: 0,
      inviteRewardGrantedCount: 0,
    });
  }

  async upsertExternalLoginToken(userId: string, merchant: string, token: string, ref?: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) {
      return;
    }

    const setPayload: {
      externalMerchant: string;
      externalToken: string;
      externalLoggedInAt: Date;
      externalRef?: string;
    } = {
      externalMerchant: merchant,
      externalToken: token,
      externalLoggedInAt: new Date(),
    };

    if (ref && ref.length > 0) {
      setPayload.externalRef = ref;
    }

    await this.userModel.updateOne(
      { _id: new Types.ObjectId(userId) },
      {
        $set: setPayload,
      },
    );
  }

  async recordInviteSuccessByPhone(phone: string): Promise<InviteSuccessResult> {
    const normalizedPhone = phone.trim();
    if (!normalizedPhone) {
      return {
        success: false,
        rewardGranted: false,
        phone: normalizedPhone,
        message: "Phone is required.",
      };
    }

    const user = await this.userModel.findOne({ phone: normalizedPhone });
    if (!user) {
      return {
        success: false,
        rewardGranted: false,
        phone: normalizedPhone,
        message: "User not found.",
      };
    }

    const dayKey = toKenyaDayKey(new Date());
    const thresholds = await this.resolveMissionThresholds(dayKey);
    let changed = await this.resetDailyAllowanceStateIfNeeded(user, dayKey);
    const rewardGranted = user.lastInviteRewardGrantedDayKey !== dayKey;

    if (rewardGranted) {
      user.lastInviteRewardGrantedDayKey = dayKey;
      user.inviteRewardGrantedCount = Math.max(0, user.inviteRewardGrantedCount ?? 0) + 1;
      changed = true;
    }

    changed = this.backfillCurrentDayMissionState(user, dayKey, thresholds) || changed;
    if (this.grantCompleteAllMissionIfEligible(user, dayKey)) {
      changed = true;
    }
    if (this.recalculateDailyAllowanceTotal(user, dayKey)) {
      changed = true;
    }

    if (changed) {
      await user.save();
    }

    const snapshot = this.buildDailyAllowanceSnapshot(user, dayKey);

    return {
      success: true,
      rewardGranted,
      phone: normalizedPhone,
      message: rewardGranted ? "Invite reward granted." : "Invite reward already granted for today.",
      dailyBetAllowanceTotal: snapshot.total,
      dailyBetAllowanceUsed: snapshot.used,
      dailyBetAllowanceRemaining: snapshot.remaining,
      inviteMissionCompletedToday: user.lastInviteRewardGrantedDayKey === dayKey,
      inviteRewardGrantedCount: Math.max(0, user.inviteRewardGrantedCount ?? 0),
    };
  }

  async applyExternalCallbackProfileUpdate(
    userId: string,
    response: CallbackResponse,
  ): Promise<DailyBetAllowanceSnapshot | null> {
    if (!Types.ObjectId.isValid(userId)) {
      return null;
    }

    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) {
      return null;
    }

    const dayKey = toKenyaDayKey(new Date());
    const thresholds = await this.resolveMissionThresholds(dayKey);
    let changed = await this.resetDailyAllowanceStateIfNeeded(user, dayKey);

    const shouldResetMetrics = this.shouldResetExternalCallbackMetrics(response);
    if (shouldResetMetrics) {
      user.depositAmount = "0.00";
      user.betAmount = "0.00";
      changed = true;
      changed = this.restoreDailyBetAllowance(user) || changed;
      if (this.recalculateDailyAllowanceTotal(user, dayKey)) {
        changed = true;
      }
      if (changed) {
        await user.save();
      }
      return this.buildDailyAllowanceSnapshot(user, dayKey);
    }

    const rawDepositAmount =
      typeof response.data?.depositAmount === "string" && response.data.depositAmount.trim().length > 0
        ? response.data.depositAmount.trim()
        : undefined;
    const normalizedDepositAmount =
      rawDepositAmount ? normalizeDepositAmount(rawDepositAmount) : undefined;
    const betAmount =
      typeof response.data?.betAmount === "string" && response.data.betAmount.trim().length > 0
        ? response.data.betAmount.trim()
        : undefined;
    const betCount =
      typeof response.data?.betCount === "number" && Number.isFinite(response.data.betCount)
        ? response.data.betCount
        : undefined;

    if (normalizedDepositAmount) {
      user.depositAmount = normalizedDepositAmount;
      changed = true;
    }

    if (betAmount) {
      user.betAmount = betAmount;
      changed = true;
    }

    const currentDepositAmount = parseAmount(user.depositAmount);
    const currentBetAmount = parseAmount(user.betAmount);

    changed = this.backfillCurrentDayMissionState(user, dayKey, thresholds) || changed;

    if (currentDepositAmount > thresholds.depositMissionThreshold) {
      if (this.grantMissionReward(user, "depositMissionCompletedDayKey", dayKey)) {
        changed = true;
      }
    }

    if (typeof betCount === "number" && betCount >= PLACE_BET_COUNT_THRESHOLD) {
      if (this.grantMissionReward(user, "placeBetMissionCompletedDayKey", dayKey)) {
        changed = true;
      }
    }

    if (currentBetAmount > thresholds.turnoverMissionThreshold) {
      if (this.grantMissionReward(user, "turnoverMissionCompletedDayKey", dayKey)) {
        changed = true;
      }
    }

    if (this.grantCompleteAllMissionIfEligible(user, dayKey)) {
      changed = true;
    }

    if (this.recalculateDailyAllowanceTotal(user, dayKey)) {
      changed = true;
    }

    if (changed) {
      await user.save();
    }

    return this.buildDailyAllowanceSnapshot(user, dayKey);
  }

  async getDailyBetAllowance(userId: string): Promise<DailyBetAllowanceSnapshot | null> {
    if (!Types.ObjectId.isValid(userId)) {
      return null;
    }

    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) {
      return null;
    }

    const dayKey = toKenyaDayKey(new Date());
    const thresholds = await this.resolveMissionThresholds(dayKey);
    const reset = await this.resetDailyAllowanceStateIfNeeded(user, dayKey);
    const backfilled = this.backfillCurrentDayMissionState(user, dayKey, thresholds);
    const completeAllGranted = this.grantCompleteAllMissionIfEligible(user, dayKey);
    const recalculated = this.recalculateDailyAllowanceTotal(user, dayKey);
    if (reset || backfilled || completeAllGranted || recalculated) {
      await user.save();
    }

    return this.buildDailyAllowanceSnapshot(user, dayKey);
  }

  async consumeDailyBetAllowance(userId: string): Promise<ConsumeDailyBetAllowanceResult | null> {
    if (!Types.ObjectId.isValid(userId)) {
      return null;
    }

    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) {
      return null;
    }

    const dayKey = toKenyaDayKey(new Date());
    const thresholds = await this.resolveMissionThresholds(dayKey);
    const reset = await this.resetDailyAllowanceStateIfNeeded(user, dayKey);
    const backfilled = this.backfillCurrentDayMissionState(user, dayKey, thresholds);
    const completeAllGranted = this.grantCompleteAllMissionIfEligible(user, dayKey);
    const recalculated = this.recalculateDailyAllowanceTotal(user, dayKey);
    const currentTotal = Math.max(0, user.dailyBetAllowanceTotal ?? 0);
    const currentUsed = Math.max(0, user.dailyBetAllowanceUsed ?? 0);

    if (currentUsed >= currentTotal) {
      if (reset || backfilled || completeAllGranted || recalculated) {
        await user.save();
      }
      return {
        ok: false,
        snapshot: this.buildDailyAllowanceSnapshot(user, dayKey),
      };
    }

    user.dailyBetAllowanceUsed = currentUsed + 1;
    await user.save();

    return {
      ok: true,
      snapshot: this.buildDailyAllowanceSnapshot(user, dayKey),
    };
  }

  async claimMissionReward(userId: string, missionId: number): Promise<MissionClaimResult> {
    if (!Types.ObjectId.isValid(userId)) {
      return {
        success: false,
        missionId,
        message: "Invalid user.",
      };
    }

    const receivedField = missionIdToReceivedField(missionId);
    if (!receivedField) {
      return {
        success: false,
        missionId,
        message: "Invalid mission id.",
      };
    }

    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) {
      return {
        success: false,
        missionId,
        message: "User not found.",
      };
    }

    const dayKey = toKenyaDayKey(new Date());
    const thresholds = await this.resolveMissionThresholds(dayKey);
    const reset = await this.resetDailyAllowanceStateIfNeeded(user, dayKey);
    const backfilled = this.backfillCurrentDayMissionState(user, dayKey, thresholds);
    const completeAllGranted = this.grantCompleteAllMissionIfEligible(user, dayKey);

    const missionStatus = this.getMissionStatusSnapshot(user, dayKey);
    const completedMap: Record<number, boolean> = {
      1: missionStatus.dailyLoginCompletedToday,
      2: missionStatus.inviteMissionCompletedToday,
      3: missionStatus.deposit99CompletedToday,
      4: missionStatus.placeBetCompletedToday,
      5: missionStatus.turnover1000CompletedToday,
      6: missionStatus.completeAllCompletedToday,
    };

    if (!completedMap[missionId]) {
      if (reset || backfilled || completeAllGranted) {
        this.recalculateDailyAllowanceTotal(user, dayKey);
        await user.save();
      }
      return {
        success: false,
        missionId,
        message: "Mission not completed yet.",
      };
    }

    const missionUser = user as UserDocument & Record<MissionReceivedDayKeyField, string | undefined>;
    if (missionUser[receivedField] === dayKey) {
      if (reset || backfilled || completeAllGranted) {
        this.recalculateDailyAllowanceTotal(user, dayKey);
        await user.save();
      }
      return {
        success: false,
        missionId,
        message: "Mission already received.",
      };
    }

    missionUser[receivedField] = dayKey;
    this.recalculateDailyAllowanceTotal(user, dayKey);
    await user.save();

    return {
      success: true,
      missionId,
      message: "Mission reward received.",
    };
  }

  async getActiveMissionThresholds(dayKey?: string): Promise<MissionThresholds> {
    const effectiveDayKey = dayKey ?? toKenyaDayKey(new Date());
    return this.resolveMissionThresholds(effectiveDayKey);
  }

  private async resetDailyAllowanceStateIfNeeded(user: UserDocument, dayKey: string): Promise<boolean> {
    const currentDayKey = user.dailyBetAllowanceDayKey;
    if (currentDayKey === dayKey) {
      return false;
    }

    if (currentDayKey) {
      const carryOverTotal = 0;

      user.dailyBetAllowanceDayKey = dayKey;
      user.dailyBetAllowanceBaseTotal = carryOverTotal;
      user.dailyBetAllowanceTotal = carryOverTotal;
      user.dailyBetAllowanceUsed = 0;
      user.dailyBetAllowanceHighestGranted = 0;
      this.grantMissionReward(user, "loginMissionCompletedDayKey", dayKey);
      this.recalculateDailyAllowanceTotal(user, dayKey);
      return true;
    }

    user.dailyBetAllowanceDayKey = dayKey;
    user.dailyBetAllowanceBaseTotal = 0;
    user.dailyBetAllowanceTotal = 0;
    user.dailyBetAllowanceUsed = 0;
    user.dailyBetAllowanceHighestGranted = 0;
    this.grantMissionReward(user, "loginMissionCompletedDayKey", dayKey);
    this.recalculateDailyAllowanceTotal(user, dayKey);
    return true;
  }

  async syncUserMissionState(userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) {
      return;
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      return;
    }

    const dayKey = toKenyaDayKey(new Date());
    const thresholds = await this.resolveMissionThresholds(dayKey);
    
    let changed = await this.resetDailyAllowanceStateIfNeeded(user, dayKey);
    changed = this.backfillCurrentDayMissionState(user, dayKey, thresholds) || changed;
    changed = this.grantCompleteAllMissionIfEligible(user, dayKey) || changed;

    if (changed) {
      await user.save();
    }
  }

  getMissionStatusSnapshot(user: UserDocument | null, dayKey: string): MissionStatusSnapshot {
    return {
      dailyLoginCompletedToday: Boolean(user?.loginMissionCompletedDayKey === dayKey),
      inviteMissionCompletedToday: Boolean(user?.lastInviteRewardGrantedDayKey === dayKey),
      placeBetCompletedToday: Boolean(user?.placeBetMissionCompletedDayKey === dayKey),
      turnover1000CompletedToday: Boolean(user?.turnoverMissionCompletedDayKey === dayKey),
      deposit99CompletedToday: Boolean(user?.depositMissionCompletedDayKey === dayKey),
      completeAllCompletedToday: Boolean(user?.completeAllMissionCompletedDayKey === dayKey),
      dailyLoginReceivedToday: Boolean(user?.loginMissionReceivedDayKey === dayKey),
      inviteMissionReceivedToday: Boolean(user?.inviteMissionReceivedDayKey === dayKey),
      placeBetReceivedToday: Boolean(user?.placeBetMissionReceivedDayKey === dayKey),
      turnover1000ReceivedToday: Boolean(user?.turnoverMissionReceivedDayKey === dayKey),
      deposit99ReceivedToday: Boolean(user?.depositMissionReceivedDayKey === dayKey),
      completeAllReceivedToday: Boolean(user?.completeAllMissionReceivedDayKey === dayKey),
    };
  }

  private grantMissionReward(user: UserDocument, field: MissionDayKeyField, dayKey: string): boolean {
    const missionUser = user as UserDocument & Record<MissionDayKeyField, string | undefined>;
    if (missionUser[field] === dayKey) {
      return false;
    }

    missionUser[field] = dayKey;
    return true;
  }

  private backfillCurrentDayMissionState(user: UserDocument, dayKey: string, thresholds: MissionThresholds): boolean {
    let changed = false;

    if (user.loginMissionCompletedDayKey !== dayKey) {
      user.loginMissionCompletedDayKey = dayKey;
      changed = true;
    }

    const currentDepositAmount = parseAmount(user.depositAmount);
    if (currentDepositAmount >= thresholds.depositMissionThreshold && user.depositMissionCompletedDayKey !== dayKey) {
      user.depositMissionCompletedDayKey = dayKey;
      changed = true;
    }

    const currentBetAmount = parseAmount(user.betAmount);
    if (currentBetAmount >= thresholds.turnoverMissionThreshold && user.turnoverMissionCompletedDayKey !== dayKey) {
      user.turnoverMissionCompletedDayKey = dayKey;
      changed = true;
    }

    if (currentBetAmount > 0 && user.placeBetMissionCompletedDayKey !== dayKey) {
      user.placeBetMissionCompletedDayKey = dayKey;
      changed = true;
    }

    return changed;
  }

  private recalculateDailyAllowanceTotal(user: UserDocument, dayKey: string): boolean {
    const missions = this.getMissionStatusSnapshot(user, dayKey);
    const missionTotal = [
      missions.dailyLoginReceivedToday,
      missions.inviteMissionReceivedToday,
      missions.placeBetReceivedToday,
      missions.turnover1000ReceivedToday,
      missions.deposit99ReceivedToday,
      missions.completeAllReceivedToday,
    ].filter(Boolean).length;
    const baseTotal = Math.max(0, user.dailyBetAllowanceBaseTotal ?? 0);
    const nextTotal = baseTotal + missionTotal;

    if ((user.dailyBetAllowanceTotal ?? 0) === nextTotal) {
      return false;
    }

    user.dailyBetAllowanceTotal = nextTotal;
    return true;
  }

  private grantCompleteAllMissionIfEligible(user: UserDocument, dayKey: string): boolean {
    const missions = this.getMissionStatusSnapshot(user, dayKey);
    if (
      missions.dailyLoginCompletedToday
      && missions.inviteMissionCompletedToday
      && missions.placeBetCompletedToday
      && missions.turnover1000CompletedToday
      && missions.deposit99CompletedToday
    ) {
      return this.grantMissionReward(user, "completeAllMissionCompletedDayKey", dayKey);
    }

    return false;
  }

  private async resolveMissionThresholds(dayKey: string): Promise<MissionThresholds> {
    const config = await this.adminConfigModel.findOne({ key: this.configKey }).lean();
    if (!config) {
      return {
        turnoverMissionThreshold: DEFAULT_TURNOVER_MISSION_THRESHOLD,
        depositMissionThreshold: DEFAULT_DEPOSIT_MISSION_THRESHOLD,
      };
    }

    const pendingActive = Boolean(
      config.pendingMissionThresholdsEffectiveDayKey
      && dayKey >= config.pendingMissionThresholdsEffectiveDayKey,
    );

    const turnoverMissionThreshold = pendingActive
      ? config.pendingTurnoverMissionThreshold ?? config.turnoverMissionThreshold
      : config.turnoverMissionThreshold;
    const depositMissionThreshold = pendingActive
      ? config.pendingDepositMissionThreshold ?? config.depositMissionThreshold
      : config.depositMissionThreshold;

    return {
      turnoverMissionThreshold: Math.max(1, Math.floor(turnoverMissionThreshold ?? DEFAULT_TURNOVER_MISSION_THRESHOLD)),
      depositMissionThreshold: Math.max(1, Math.floor(depositMissionThreshold ?? DEFAULT_DEPOSIT_MISSION_THRESHOLD)),
    };
  }

  private shouldResetExternalCallbackMetrics(response: CallbackResponse): boolean {
    if (response.error === true || response.success === false) {
      return true;
    }

    const message = (response.message ?? "").toLowerCase();
    const isExpiredToken = message.includes("token is expired") || message.includes("token expired");
    const isHttp400 = message.includes("http 400") || message.includes("status 400") || message.includes("400");
    if (isExpiredToken || isHttp400) {
      return true;
    }

    const hasData = Boolean(
      response.data?.depositAmount !== undefined
      || response.data?.betAmount !== undefined
      || response.data?.betCount !== undefined,
    );

    return !hasData;
  }

  private restoreDailyBetAllowance(user: UserDocument): boolean {
    const currentUsed = Math.max(0, user.dailyBetAllowanceUsed ?? 0);
    if (currentUsed <= 0) {
      return false;
    }

    user.dailyBetAllowanceUsed = currentUsed - 1;
    return true;
  }

  private buildDailyAllowanceSnapshot(user: UserDocument, dayKey: string): DailyBetAllowanceSnapshot {
    const total = Math.max(0, user.dailyBetAllowanceTotal ?? 0);
    const used = Math.max(0, user.dailyBetAllowanceUsed ?? 0);
    const remaining = Math.max(0, total - used);
    const highestGranted = Math.max(0, user.dailyBetAllowanceHighestGranted ?? 0);

    return {
      dayKey,
      total,
      used,
      remaining,
      highestGranted,
    };
  }

  async validatePassword(user: UserDocument, password: string): Promise<boolean> {
    if (!user.localPasswordEnabled) {
      return false;
    }

    if (!user.passwordHash) {
      return false;
    }

    return bcrypt.compare(password, user.passwordHash);
  }
}
