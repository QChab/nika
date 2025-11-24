import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

export type TradeDocument = Trade & Document & { createdAt: Date; updatedAt: Date };

@Schema({ timestamps: true })
export class Trade {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  volume!: string;

  @Prop({ type: String, required: true })
  feeRate!: string;

  @Prop({ type: String, required: true })
  totalFee!: string;

  @Prop({ type: String, required: true })
  cashbackAmount!: string;

  @Prop({ type: String, required: true })
  treasuryAmount!: string;

  @Prop({ type: String, required: true })
  totalCommissions!: string;

  @Prop({ type: String, required: true })
  token!: string; // The tokenIn token (e.g., 'BTC', 'ETH', 'SOL') - fees taken in this token

  @Prop({ type: String, required: true, enum: ['ARBITRUM', 'SOLANA'] })
  chain!: 'ARBITRUM' | 'SOLANA';

  @Prop({ type: String, required: true, enum: ['BUY', 'SELL'] })
  side!: 'BUY' | 'SELL';

  @Prop({ type: Boolean, default: false })
  commissionsDistributed!: boolean;

  @Prop({ type: Date })
  distributedAt?: Date;
}

export const TradeSchema = SchemaFactory.createForClass(Trade);

TradeSchema.index({ userId: 1, createdAt: -1 });
TradeSchema.index({ chain: 1 });
TradeSchema.index({ commissionsDistributed: 1 });
