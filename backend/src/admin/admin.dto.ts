import {
  IsDateString,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Matches,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

const RECORD_STATUSES = ["Pending", "Won", "Expired", "Unmatched", "Voided"] as const;

export class UpdateLiveConfigDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{6,20}$/)
  youtubeVideoId?: string;

  @IsOptional()
  @IsBoolean()
  liveOverlayEnabled?: boolean;
}

export class UpdateJackpotIncrementDto {
  @IsInt()
  @Min(1)
  amount!: number;
}

export class UpdateDataPinDto {
  @IsString()
  @Matches(/^\d{4}$/)
  pin!: string;
}

export class VerifyDataPinDto {
  @IsString()
  @Matches(/^\d{4}$/)
  pin!: string;
}

export class WinnersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  account?: string;

  @IsOptional()
  @IsString()
  merchant?: string;

  @IsOptional()
  @IsIn(RECORD_STATUSES)
  status?: (typeof RECORD_STATUSES)[number];
}

export class DrawnNumbersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class UpdateMissionThresholdsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  turnoverMissionThreshold!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  depositMissionThreshold!: number;
}
