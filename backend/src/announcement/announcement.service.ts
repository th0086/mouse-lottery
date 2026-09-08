import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Announcement } from './announcement.schema';

type AnnouncementView = {
  enabled: boolean;
  content: string;
};

@Injectable()
export class AnnouncementService {
  constructor(
    @InjectModel(Announcement.name) private announcementModel: Model<Announcement>,
  ) {}

  async get(): Promise<AnnouncementView> {
    const doc = await this.announcementModel.findOne().lean();
    if (!doc) {
      return { enabled: false, content: "" };
    }

    return {
      enabled: Boolean(doc.enabled),
      content: typeof doc.content === "string" ? doc.content : "",
    };
  }

  async upsert(enabled: boolean, content: string): Promise<Announcement> {
    return this.announcementModel.findOneAndUpdate(
      {},
      { enabled, content },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
}
