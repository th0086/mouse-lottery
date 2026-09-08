import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type DrawCounterDocument = HydratedDocument<DrawCounter>;

@Schema({ timestamps: true, collection: "draw_counters" })
export class DrawCounter {
  @Prop({ required: true, unique: true, default: "global" })
  scope!: string;

  @Prop({ required: true, default: 0, min: 0 })
  totalDrawCount!: number;

  @Prop({ required: false })
  lastReceivedAt?: Date;
}

export const DrawCounterSchema = SchemaFactory.createForClass(DrawCounter);
