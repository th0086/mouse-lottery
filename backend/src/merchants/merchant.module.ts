import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MerchantService } from "./merchant.service";

@Module({
  imports: [ConfigModule],
  providers: [MerchantService],
  exports: [MerchantService],
})
export class MerchantModule {}
