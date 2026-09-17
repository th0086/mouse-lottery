import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { AnnouncementService } from "./announcement.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UpsertAnnouncementDto } from "./announcement.dto";

@Controller("announcement")
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @Get()
  async get() {
    return this.announcementService.get();
  }

  @Patch()
  @UseGuards(JwtAuthGuard)
  async upsert(@Body() body: UpsertAnnouncementDto) {
    return this.announcementService.upsert(body.enabled, body.content);
  }
}
