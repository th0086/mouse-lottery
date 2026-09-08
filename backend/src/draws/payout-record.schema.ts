import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type PayoutRecordDocument = HydratedDocument<PayoutRecord>;

@Schema({ timestamps: true })
export class PayoutRecord {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  entryId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  settlementKey!: string;

  @Prop({ required: true, min: 0 })
  jackpotBeforeSplitKES!: number;

  @Prop({ required: true, min: 1 })
  winnerCount!: number;

  @Prop({ required: true, min: 0 })
  payoutKES!: number;

  @Prop({ required: true })
  settledAt!: Date;
}

export const PayoutRecordSchema = SchemaFactory.createForClass(PayoutRecord);
PayoutRecordSchema.index({ settlementKey: 1, entryId: 1 }, { unique: true });
PayoutRecordSchema.index({ userId: 1, settledAt: -1 });
