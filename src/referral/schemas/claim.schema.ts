import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

export type ClaimDocument = Claim & Document;

@Schema({ timestamps: true })
export class Claim {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  amount!: string;

  @Prop({ type: String, required: true, enum: ['USDC'] })
  token!: 'USDC';

  @Prop({ type: String, required: true, enum: ['ARBITRUM', 'SOLANA'] })
  chain!: 'ARBITRUM' | 'SOLANA';

  @Prop({
    type: String,
    required: true,
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
    default: 'PENDING',
  })
  status!: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

  @Prop({
    type: String,
    required: true,
    enum: ['COMMISSION', 'CASHBACK'],
  })
  claimType!: 'COMMISSION' | 'CASHBACK';

  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Commission' }] })
  commissionIds?: Types.ObjectId[];

  @Prop({ type: String })
  transactionHash?: string;

  @Prop({ type: String })
  merkleRoot?: string;

  @Prop({ type: [String] })
  merkleProof?: string[];

  @Prop({ type: String })
  failureReason?: string;

  @Prop({ type: Date })
  completedAt?: Date;
}

export const ClaimSchema = SchemaFactory.createForClass(Claim);

ClaimSchema.index({ userId: 1, status: 1 });
ClaimSchema.index({ userId: 1, createdAt: -1 });
ClaimSchema.index({ status: 1 });
