import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { AdminModule } from "./admin/admin.module";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { CallbackModule } from "./callbacks/callback.module";
import { DrawsModule } from "./draws/draws.module";
import { GameController } from "./game.controller";
import { MerchantModule } from "./merchants/merchant.module";
import { UsersModule } from "./users/users.module";
import { AnnouncementModule } from "./announcement/announcement.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Support startup from either repo root or backend workspace.
      envFilePath: [".env", "../.env"],
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri:
          configService.get<string>("MONGODB_URI") ??
          "mongodb://localhost:27017/mouse_lottery?authSource=admin",
      }),
    }),
    UsersModule,
    MerchantModule,
    CallbackModule,
    AuthModule,
    AdminModule,
    DrawsModule,
    AnnouncementModule,
  ],
  controllers: [AppController, GameController],
})
export class AppModule {}
