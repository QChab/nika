import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection } from 'mongoose';
import { ReferralModule } from '../src/referral/referral.module';
import { TradeModule } from '../src/trade/trade.module';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import type { Server } from 'http';

describe('Trade Webhook E2E', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let connection: Connection;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRoot(uri),
        ReferralModule,
        TradeModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      })
    );

    connection = moduleFixture.get<Connection>(getConnectionToken());
    await app.init();
  }, 60000);

  afterAll(async () => {
    if (connection) await connection.close();
    if (app) await app.close();
    if (mongod) await mongod.stop();
  }, 30000);

  beforeEach(async () => {
    const collections = connection.collections;
    for (const key in collections) {
      await collections[key]?.deleteMany({});
    }
  });

  describe('Commission Distribution', () => {
    it('should distribute commissions across referral chain on trade', async () => {
      const userAResponse = await request(app.getHttpServer() as Server)
        .post('/api/referral/generate')
        .send({})
        .expect(201);

      const userBResponse = await request(app.getHttpServer() as Server)
        .post('/api/referral/register')
        .send({
          referralCode: userAResponse.body.referralCode,
        })
        .expect(201);

      const userCResponse = await request(app.getHttpServer() as Server)
        .post('/api/referral/register')
        .send({
          referralCode: userBResponse.body.referralCode,
        })
        .expect(201);

      const tradeResponse = await request(app.getHttpServer() as Server)
        .post('/api/webhook/trade')
        .send({
          userId: userCResponse.body.userId,
          volume: '10000',
          token: 'BTC',
          side: 'BUY',
          chain: 'ARBITRUM',
        })
        .expect(200);

      expect(tradeResponse.body.tradeId).toBeDefined();
      expect(tradeResponse.body.totalFee).toBe('100');
      expect(tradeResponse.body.cashback).toBe('10');
      expect(tradeResponse.body.treasury).toBe('55');
      expect(tradeResponse.body.commissions).toHaveLength(2);
      expect(tradeResponse.body.commissions[0].level).toBe(1);
      expect(tradeResponse.body.commissions[0].amount).toBe('30');
      expect(tradeResponse.body.commissions[1].level).toBe(2);
      expect(tradeResponse.body.commissions[1].amount).toBe('3');
    });

    it('should handle trade for user without referrer', async () => {
      const userResponse = await request(app.getHttpServer() as Server)
        .post('/api/referral/generate')
        .send({})
        .expect(201);

      const tradeResponse = await request(app.getHttpServer() as Server)
        .post('/api/webhook/trade')
        .send({
          userId: userResponse.body.userId,
          volume: '5000',
          token: 'ETH',
          side: 'SELL',
          chain: 'SOLANA',
        })
        .expect(200);

      expect(tradeResponse.body.totalFee).toBe('50');
      expect(tradeResponse.body.cashback).toBe('5');
      expect(tradeResponse.body.treasury).toBe('27.5');
      expect(tradeResponse.body.commissions).toHaveLength(0);
    });

    it('should update earnings after trade', async () => {
      const referrerResponse = await request(app.getHttpServer() as Server)
        .post('/api/referral/generate')
        .send({})
        .expect(201);

      const traderResponse = await request(app.getHttpServer() as Server)
        .post('/api/referral/register')
        .send({
          referralCode: referrerResponse.body.referralCode,
        })
        .expect(201);

      await request(app.getHttpServer() as Server)
        .post('/api/webhook/trade')
        .send({
          userId: traderResponse.body.userId,
          volume: '1000',
          token: 'BTC',
          side: 'BUY',
          chain: 'ARBITRUM',
        })
        .expect(200);

      const earningsResponse = await request(app.getHttpServer() as Server)
        .get('/api/referral/earnings')
        .set('x-user-id', referrerResponse.body.userId as string)
        .expect(200);

      expect(earningsResponse.body.grandTotal).toBe('3');
      expect(earningsResponse.body.byLevel).toHaveLength(1);
      expect(earningsResponse.body.byLevel[0].level).toBe(1);
    });

    it('should reject trade for non-existent user', async () => {
      await request(app.getHttpServer() as Server)
        .post('/api/webhook/trade')
        .send({
          userId: '507f1f77bcf86cd799439011',
          volume: '1000',
          token: 'BTC',
          side: 'BUY',
          chain: 'ARBITRUM',
        })
        .expect(404);
    });

    it('should reject trade for invalid user ID format', async () => {
      await request(app.getHttpServer() as Server)
        .post('/api/webhook/trade')
        .send({
          userId: 'invalid-id',
          volume: '1000',
          token: 'BTC',
          side: 'BUY',
          chain: 'ARBITRUM',
        })
        .expect(400);
    });
  });

  describe('Fee Distribution Verification', () => {
    it('should verify fee breakdown matches spec', async () => {
      const userResponse = await request(app.getHttpServer() as Server)
        .post('/api/referral/generate')
        .send({})
        .expect(201);

      const tradeResponse = await request(app.getHttpServer() as Server)
        .post('/api/webhook/trade')
        .send({
          userId: userResponse.body.userId,
          volume: '10000',
          token: 'BTC',
          side: 'BUY',
          chain: 'ARBITRUM',
        })
        .expect(200);

      const totalFee = parseFloat(tradeResponse.body.totalFee as string);
      const cashback = parseFloat(tradeResponse.body.cashback as string);
      const treasury = parseFloat(tradeResponse.body.treasury as string);

      expect(cashback / totalFee).toBeCloseTo(0.1, 2);
      expect(treasury / totalFee).toBeCloseTo(0.55, 2);
    });
  });
});
