import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

export type UserDocument = User & Document & { createdAt: Date; updatedAt: Date };

@Schema({ timestamps: true })
export class User {
  @Prop({ type: String, required: true, unique: true })
  referralCode!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  referrerId?: Types.ObjectId | null;

  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }], default: [] })
  directReferrals!: Types.ObjectId[];

  @Prop({ type: Number, default: 0 })
  referralDepth!: number;

  @Prop({
    type: String,
    enum: ['BASE', 'REDUCED'],
    default: 'BASE',
  })
  feeTier!: 'BASE' | 'REDUCED';

  @Prop({
    type: MongooseSchema.Types.Mixed,
    default: null,
  })
  customCommissionStructure?: {
    type: 'KOL_DIRECT' | 'KOL_CUSTOM' | 'WAIVED';
    level1Rate?: string;
    level2Rate?: string;
    level3Rate?: string;
    feesWaived?: boolean;
    commissionsWaived?: boolean;
  } | null;

  @Prop({ type: MongooseSchema.Types.Decimal128, default: 0 })
  totalXpEarned!: Types.Decimal128;

  @Prop({ type: MongooseSchema.Types.Decimal128, default: 0 })
  totalCommissionEarned!: Types.Decimal128;

  @Prop({ type: MongooseSchema.Types.Decimal128, default: 0 })
  totalCashbackEarned!: Types.Decimal128;

  @Prop({ type: Boolean, default: true })
  isActive!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ referrerId: 1 });
UserSchema.index({ createdAt: -1 });
