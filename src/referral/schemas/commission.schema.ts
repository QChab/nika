import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

export type CommissionDocument = Commission & Document;

@Schema({ timestamps: true })
export class Commission {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  sourceUserId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Trade', required: true })
  tradeId!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 1, max: 3 })
  level!: number;

  @Prop({ type: String, required: true })
  amount!: string;

  @Prop({ type: String, required: true })
  rate!: string;

  @Prop({ type: String, required: true })
  tradeVolume!: string;

  @Prop({ type: String, required: true })
  tradeFee!: string;

  @Prop({ type: String, required: true })
  token!: string; // The tokenIn token (e.g., 'BTC', 'ETH', 'SOL')

  @Prop({ type: String, required: true, enum: ['ARBITRUM', 'SOLANA'] })
  chain!: 'ARBITRUM' | 'SOLANA';

  @Prop({ type: Boolean, default: false })
  isClaimed!: boolean;

  @Prop({ type: Date })
  claimedAt?: Date;

  @Prop({ type: String })
  merkleRoot?: string;

  @Prop({ type: [String] })
  merkleProof?: string[];
}

export const CommissionSchema = SchemaFactory.createForClass(Commission);

CommissionSchema.index({ userId: 1, isClaimed: 1 });
CommissionSchema.index({ userId: 1, createdAt: -1 });
CommissionSchema.index({ sourceUserId: 1 });
CommissionSchema.index({ tradeId: 1 });
CommissionSchema.index({ level: 1 });
