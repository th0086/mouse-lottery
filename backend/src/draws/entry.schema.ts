import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type EntryDocument = HydratedDocument<Entry>;

export type EntryStatus = "Pending" | "Won" | "Expired" | "Unmatched" | "Voided";
export type CallbackStatus = "pending" | "success" | "failed" | "abnormal";
export type EntryRuleVersion = "legacy_time_window" | "draw_window_v2";

@Schema({ timestamps: true })
export class Entry {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: [Number], required: true })
  numbers!: number[];

  /** When the bet was placed */
  @Prop({ required: true, index: true })
  placedAt!: Date;

  /** Numbers pushed before this time don't count (placedAt + 5 min) */
  @Prop({ required: true })
  validFrom!: Date;

  /** Bet expires at 23:59:59 of the day it was placed */
  @Prop({ required: true, index: true })
  expiresAt!: Date;

  @Prop({ required: false, enum: ["legacy_time_window", "draw_window_v2"], index: true })
  ruleVersion?: EntryRuleVersion;

  /** Number of drawn digits that existed when this entry was created. */
  @Prop({ required: false, index: true })
  placedAfterDrawCount?: number;

  @Prop({ required: true, enum: ["Pending", "Won", "Expired", "Unmatched", "Voided"], default: "Pending", index: true })
  status!: EntryStatus;

  @Prop({ required: false })
  settledAt?: Date;

  @Prop({ required: false })
  winningSequenceEndedAt?: Date;

  @Prop({ required: false })
  merchantId?: string;

  @Prop({ required: false })
  callbackActionId?: string;

  @Prop({ required: false })
  callbackSuccess?: boolean;

  @Prop({ required: false })
  callbackError?: boolean;

  @Prop({ required: false })
  callbackMessage?: string;

  @Prop({ required: false, index: true })
  callbackSentAt?: Date;

  @Prop({ required: false, enum: ["pending", "success", "failed", "abnormal"], index: true })
  callbackStatus?: CallbackStatus;

  createdAt?: Date;
  updatedAt?: Date;
}

export const EntrySchema = SchemaFactory.createForClass(Entry);
EntrySchema.index({ status: 1, ruleVersion: 1, placedAfterDrawCount: 1 });
EntrySchema.index({ userId: 1, createdAt: -1 });
EntrySchema.index({ status: 1, ruleVersion: 1, validFrom: 1, expiresAt: 1 });
EntrySchema.index({ status: 1, ruleVersion: 1, expiresAt: 1 });
