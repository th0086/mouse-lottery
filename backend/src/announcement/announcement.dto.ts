import { IsBoolean, IsString, MaxLength } from "class-validator";

export class UpsertAnnouncementDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @MaxLength(2000)
  content!: string;
}
