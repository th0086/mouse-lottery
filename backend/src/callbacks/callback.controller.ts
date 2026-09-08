import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import { UsersService } from "../users/users.service";

class InviteSuccessDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  phone!: string;
}

@Controller("callbacks")
export class CallbackController {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  @Post("invite-success")
  @HttpCode(HttpStatus.OK)
  async inviteSuccess(
    @Headers("x-callback-token") callbackToken: string | undefined,
    @Body() dto: InviteSuccessDto,
  ) {
    const expectedToken = (this.configService.get<string>("CALLBACK_TOKEN") ?? "").trim();
    const normalizedToken = callbackToken?.trim() ?? "";

    if (!expectedToken || normalizedToken !== expectedToken) {
      throw new UnauthorizedException("Invalid callback token");
    }

    return this.usersService.recordInviteSuccessByPhone(dto.phone);
  }
}