import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AdminModule } from "../admin/admin.module";
import { CallbackModule } from "../callbacks/callback.module";
import { MerchantModule } from "../merchants/merchant.module";
import { User, UserSchema } from "../users/user.schema";
import { DrawCounter, DrawCounterSchema } from "./draw-counter.schema";
import { DrawDaySummary, DrawDaySummarySchema } from "./draw-day-summary.schema";
import { DrawnNumber, DrawnNumberSchema } from "./drawn-number.schema";
import { DrawsService } from "./draws.service";
import { Entry, EntrySchema } from "./entry.schema";
import { JackpotState, JackpotStateSchema } from "./jackpot-state.schema";
import { PayoutRecord, PayoutRecordSchema } from "./payout-record.schema";

@Module({
  imports: [
    AdminModule,
    MerchantModule,
    CallbackModule,
    MongooseModule.forFeature([
      { name: DrawCounter.name, schema: DrawCounterSchema },
      { name: DrawDaySummary.name, schema: DrawDaySummarySchema },
      { name: DrawnNumber.name, schema: DrawnNumberSchema },
      { name: Entry.name, schema: EntrySchema },
      { name: JackpotState.name, schema: JackpotStateSchema },
      { name: PayoutRecord.name, schema: PayoutRecordSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [DrawsService],
  exports: [DrawsService],
})
export class DrawsModule {}
