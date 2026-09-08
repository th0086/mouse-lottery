import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min, Max, MinLength } from "class-validator";

const KENYA_PHONE_REGEX = /^(?:\+254[71]\d{8}|0[71]\d{8})$/;

export class RegisterDto {
  @IsString()
  @Matches(KENYA_PHONE_REGEX, {
    message: "Please enter a valid Kenyan mobile number.",
  })
  phone!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class LoginDto {
  @IsString()
  phone!: string;

  @IsString()
  password!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class ExternalLoginDto {
  @IsString()
  @IsNotEmpty()
  merchant!: string;

  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ref?: string;
}

export class ClaimMissionDto {
  @IsInt()
  @Min(1)
  @Max(6)
  missionId!: number;
}
