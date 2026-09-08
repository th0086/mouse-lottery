import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class PushNumberDataDto {
  @IsOptional()
  @IsString()
  sn!: string;

  @IsInt()
  @Min(0)
  @Max(9)
  number!: number;

  @IsOptional()
  @IsString()
  timestamp!: string;
}

export class PushNumberDto {
  @IsOptional()
  @IsString()
  date!: string;

  @IsOptional()
  @IsNumber()
  created_at!: number;

  @IsOptional()
  @IsString()
  port!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PushNumberDataDto)
  data!: PushNumberDataDto;
}

export class CreateEntryDto {
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(9, { each: true })
  numbers!: number[];
}
