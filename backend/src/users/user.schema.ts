import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  phone!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ required: true, default: "local", enum: ["local", "external"] })
  authProvider!: "local" | "external";

  @Prop({ required: true, default: true })
  localPasswordEnabled!: boolean;

  @Prop({ default: "player", enum: ["player", "admin", "super_admin", "data_admin"] })
  role!: "player" | "admin" | "super_admin" | "data_admin";

  @Prop({ type: [String], default: [] })
  permissions!: string[];

  @Prop({ required: true, default: 0, min: 0 })
  walletBalanceKES!: number;

  @Prop({ required: true, default: "KES" })
  walletCurrency!: string;

  @Prop({ required: false })
  externalMerchant?: string;

  @Prop({ required: false })
  externalToken?: string;

  @Prop({ required: false })
  externalRef?: string;

  @Prop({ required: false, default: "0.00" })
  depositAmount?: string;

  @Prop({ required: false, default: "0.00" })
  betAmount?: string;

  @Prop({ required: false })
  dailyBetAllowanceDayKey?: string;

  @Prop({ required: true, default: 0, min: 0 })
  dailyBetAllowanceTotal!: number;

  @Prop({ required: true, default: 0, min: 0 })
  dailyBetAllowanceBaseTotal!: number;

  @Prop({ required: true, default: 0, min: 0 })
  dailyBetAllowanceUsed!: number;

  @Prop({ required: true, default: 0, min: 0 })
  dailyBetAllowanceHighestGranted!: number;

  @Prop({ required: false })
  lastInviteRewardGrantedDayKey?: string;

  @Prop({ required: false })
  loginMissionCompletedDayKey?: string;

  @Prop({ required: false })
  placeBetMissionCompletedDayKey?: string;

  @Prop({ required: false })
  turnoverMissionCompletedDayKey?: string;

  @Prop({ required: false })
  depositMissionCompletedDayKey?: string;

  @Prop({ required: false })
  completeAllMissionCompletedDayKey?: string;

  @Prop({ required: false })
  loginMissionReceivedDayKey?: string;

  @Prop({ required: false })
  inviteMissionReceivedDayKey?: string;

  @Prop({ required: false })
  placeBetMissionReceivedDayKey?: string;

  @Prop({ required: false })
  turnoverMissionReceivedDayKey?: string;

  @Prop({ required: false })
  depositMissionReceivedDayKey?: string;

  @Prop({ required: false })
  completeAllMissionReceivedDayKey?: string;

  @Prop({ required: true, default: 0, min: 0 })
  inviteRewardGrantedCount!: number;

  @Prop({ required: false })
  externalLoggedInAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
