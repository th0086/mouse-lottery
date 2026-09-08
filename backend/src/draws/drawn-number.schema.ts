import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type DrawnNumberDocument = HydratedDocument<DrawnNumber>;

@Schema()
export class DrawnNumber {
  /** Single digit 0–9 */
  @Prop({ required: true })
  number!: number;

  /** When this number was received from the external push */
  @Prop({ required: true, index: true })
  receivedAt!: Date;

  /** YYYY-MM-DD in UTC – used to scope per-day sequence */
  @Prop({ required: true, index: true })
  dayKey!: string;
}

export const DrawnNumberSchema = SchemaFactory.createForClass(DrawnNumber);
DrawnNumberSchema.index({ dayKey: 1, receivedAt: 1 });
