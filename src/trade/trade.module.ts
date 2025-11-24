import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Trade, TradeSchema } from './schemas/trade.schema';
import { TradeService } from './services/trade.service';
import { TradeController } from './trade.controller';
import { ReferralModule } from '../referral/referral.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Trade.name, schema: TradeSchema }]),
    ReferralModule,
  ],
  controllers: [TradeController],
  providers: [TradeService],
  exports: [TradeService],
})
export class TradeModule {}
