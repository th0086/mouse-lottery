import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { CallbackModule } from "../callbacks/callback.module";
import { MerchantModule } from "../merchants/merchant.module";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AdminIpGuard } from "./admin-ip.guard";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { PermissionsGuard } from "./permissions.guard";
import { RolesGuard } from "./roles.guard";

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    MerchantModule,
    CallbackModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_ACCESS_SECRET") ?? "access-secret",
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RolesGuard, PermissionsGuard, AdminIpGuard],
  exports: [AuthService, PermissionsGuard, AdminIpGuard],
})
export class AuthModule {}
