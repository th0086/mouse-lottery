import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import { DrawnNumber, DrawnNumberSchema } from "../draws/drawn-number.schema";
import { Entry, EntrySchema } from "../draws/entry.schema";
import { PayoutRecord, PayoutRecordSchema } from "../draws/payout-record.schema";
import { User, UserSchema } from "../users/user.schema";
import { AdminConfig, AdminConfigSchema } from "./admin-config.schema";
import { AdminController } from "./admin.controller";
import { DataController } from "./data.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: AdminConfig.name, schema: AdminConfigSchema },
      { name: PayoutRecord.name, schema: PayoutRecordSchema },
      { name: Entry.name, schema: EntrySchema },
      { name: DrawnNumber.name, schema: DrawnNumberSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AdminController, DataController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
