import { Body, Controller, Get, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Permissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { DrawnNumbersQueryDto, VerifyDataPinDto, WinnersQueryDto } from "./admin.dto";
import { AdminService } from "./admin.service";

@Controller("data")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DataController {
  constructor(private readonly adminService: AdminService) {}

  @Post("verify-pin")
  @Permissions("data:read")
  verifyPin(@Body() dto: VerifyDataPinDto) {
    return this.adminService.verifyDataPin(dto.pin);
  }

  @Get("winners")
  @Permissions("data:read")
  listWinners(@Query() query: WinnersQueryDto) {
    return this.adminService.getWinners(query);
  }

  @Get("drawn-numbers")
  @Permissions("data:read")
  listDrawnNumbers(@Query() query: DrawnNumbersQueryDto) {
    return this.adminService.getDrawnNumbers(query);
  }

  @Get("drawn-numbers/csv")
  @Permissions("data:read")
  async downloadDrawnNumbersCsv(@Query() query: DrawnNumbersQueryDto, @Res() res: Response) {
    const csv = await this.adminService.buildDrawnNumbersCsv(query);
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=drawn-number-record-${today}.csv`);
    res.send(csv);
  }

  @Get("winners/csv")
  @Permissions("data:read")
  async downloadWinnersCsv(@Query() query: WinnersQueryDto, @Res() res: Response) {
    const csv = await this.adminService.buildWinnersCsv(query);
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=records-list-${today}.csv`);
    res.send(csv);
  }
}
