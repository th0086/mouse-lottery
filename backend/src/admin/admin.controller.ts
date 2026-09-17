import { Body, Controller, Get, Patch, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Permissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import {
  UpdateDataPinDto,
  UpdateMissionThresholdsDto,
  UpdateLiveConfigDto,
  UpdateJackpotIncrementDto,
  WinnersQueryDto,
} from "./admin.dto";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("me")
  @Permissions("admin:access")
  me() {
    return { canAccessAdmin: true };
  }

  @Get("live-config")
  @Permissions("live:manage")
  getLiveConfig() {
    return this.adminService.getLiveConfig();
  }

  @Patch("live-config")
  @Permissions("live:manage")
  updateLiveConfig(@Body() dto: UpdateLiveConfigDto) {
    return this.adminService.updateLiveConfig({
      youtubeVideoId: dto.youtubeVideoId,
      liveOverlayEnabled: dto.liveOverlayEnabled,
    });
  }

  @Get("jackpot-increment")
  @Permissions("draw:manage")
  getJackpotIncrement() {
    return this.adminService.getJackpotIncrement();
  }

  @Patch("jackpot-increment")
  @Permissions("draw:manage")
  updateJackpotIncrement(@Body() dto: UpdateJackpotIncrementDto) {
    return this.adminService.updateJackpotIncrement(dto.amount);
  }

  @Get("data-pin")
  @Permissions("draw:manage")
  getDataPin() {
    return this.adminService.getDataPin();
  }

  @Patch("data-pin")
  @Permissions("draw:manage")
  updateDataPin(@Body() dto: UpdateDataPinDto) {
    return this.adminService.updateDataPin(dto.pin);
  }

  @Get("mission-thresholds")
  @Permissions("draw:manage")
  getMissionThresholds() {
    return this.adminService.getMissionThresholds();
  }

  @Patch("mission-thresholds")
  @Permissions("draw:manage")
  updateMissionThresholds(@Body() dto: UpdateMissionThresholdsDto) {
    return this.adminService.updateMissionThresholds(dto);
  }

  @Get("winners")
  @Permissions("draw:manage")
  listWinners(@Query() query: WinnersQueryDto) {
    return this.adminService.getWinners(query);
  }

  @Get("winners/csv")
  @Permissions("draw:manage")
  async downloadWinnersCsv(@Query() query: WinnersQueryDto, @Res() res: Response) {
    const csv = await this.adminService.buildWinnersCsv(query);
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=records-list-${today}.csv`);
    res.send(csv);
  }
}
