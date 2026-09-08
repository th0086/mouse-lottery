import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { CallbackController } from "./callback.controller";
import { CallbackService } from "./callback.service";

@Module({
  imports: [UsersModule],
  controllers: [CallbackController],
  providers: [CallbackService],
  exports: [CallbackService],
})
export class CallbackModule {}
