import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { Commission, CommissionSchema } from './schemas/commission.schema';
import { Claim, ClaimSchema } from './schemas/claim.schema';
import { ReferralService } from './services/referral.service';
import { ReferralController } from './referral.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Commission.name, schema: CommissionSchema },
      { name: Claim.name, schema: ClaimSchema },
    ]),
  ],
  controllers: [ReferralController],
  providers: [ReferralService],
  exports: [ReferralService, MongooseModule],
})
export class ReferralModule {}
