import { Controller, Post, Get, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { TradeService } from './services/trade.service';
import { TradeWebhookDto, TradeResponseDto } from './dto/trade.dto';

@ApiTags('Trade')
@Controller('webhook')
export class TradeController {
  constructor(private readonly tradeService: TradeService) {}

  @Get('trades')
  @ApiOperation({ summary: 'Get all trades in the system' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user wallet address' })
  @ApiResponse({ status: 200, description: 'List of trades' })
  async getAllTrades(@Query('userId') userId?: string) {
    return this.tradeService.getAllTrades(userId);
  }

  @Post('trade')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process trade webhook and distribute commissions' })
  @ApiResponse({ status: 200, description: 'Trade processed successfully', type: TradeResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid trade data' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async processTrade(@Body() dto: TradeWebhookDto): Promise<TradeResponseDto> {
    const { trade, feeDistribution } = await this.tradeService.processTrade(
      dto.userId,
      dto.volume,
      dto.token,
      dto.side,
      dto.chain
    );

    return {
      tradeId: trade._id.toString(),
      userId: dto.userId,
      volume: trade.volume,
      token: trade.token,
      totalFee: trade.totalFee,
      cashback: feeDistribution.cashback.toString(),
      treasury: feeDistribution.treasury.toString(),
      commissions: feeDistribution.commissions.map((c) => ({
        userId: c.userId,
        level: c.level,
        amount: c.amount.toString(),
        rate: c.rate.toString(),
      })),
      chain: trade.chain,
      createdAt: trade.createdAt,
    };
  }
}
