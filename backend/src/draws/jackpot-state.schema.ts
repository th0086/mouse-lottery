import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type JackpotStateDocument = HydratedDocument<JackpotState>;

@Schema({ timestamps: true, collection: "jackpot_states" })
export class JackpotState {
  @Prop({ required: true, unique: true, default: "global" })
  scope!: string;

  @Prop({ required: true, default: 0, min: 0 })
  currentAmountKES!: number;

  @Prop({ required: true, default: "KES" })
  currency!: string;

  @Prop({ required: false })
  lastSettledAt?: Date;

  @Prop({ required: false })
  lastSettlementKey?: string;

  @Prop({ required: false })
  lastAccumulatedAt?: Date;
}

export const JackpotStateSchema = SchemaFactory.createForClass(JackpotState);
