import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'announcement', timestamps: true })
export class Announcement extends Document {
  @Prop({ required: true, default: false })
  enabled!: boolean;

  @Prop({ required: true, default: '' })
  content!: string;
}

export const AnnouncementSchema = SchemaFactory.createForClass(Announcement);
