import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type DrawDaySummaryDocument = HydratedDocument<DrawDaySummary>;

@Schema({ timestamps: true, collection: "draw_day_summaries" })
export class DrawDaySummary {
  @Prop({ required: true, unique: true, index: true })
  dayKey!: string;

  @Prop({ required: true, default: 0, min: 0 })
  total!: number;

  @Prop({ required: false })
  lastReceivedAt?: Date;
}

export const DrawDaySummarySchema = SchemaFactory.createForClass(DrawDaySummary);
