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

describe('Referral System E2E', () => {
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

  describe('POST /api/referral/generate', () => {
    it('should generate a unique referral code for new user', async () => {
      const response = await request(app.getHttpServer() as Server)
        .post('/api/referral/generate')
        .send({})
        .expect(201);

      expect(response.body.userId).toBeDefined();
      expect(response.body.referralCode).toBeDefined();
      expect(response.body.referralCode.length).toBe(8);
    });
  });

  describe('POST /api/referral/register', () => {
    it('should register user with valid referral code', async () => {
      const referrerResponse = await request(app.getHttpServer() as Server)
        .post('/api/referral/generate')
        .send({})
        .expect(201);

      const registerResponse = await request(app.getHttpServer() as Server)
        .post('/api/referral/register')
        .send({
          referralCode: referrerResponse.body.referralCode,
        })
        .expect(201);

      expect(registerResponse.body.userId).toBeDefined();
      expect(registerResponse.body.referralCode).toBeDefined();
      expect(registerResponse.body.referralCode).not.toBe(referrerResponse.body.referralCode);
    });

    it('should reject registration with invalid referral code', async () => {
      await request(app.getHttpServer() as Server)
        .post('/api/referral/register')
        .send({
          referralCode: 'INVALID1',
        })
        .expect(404);
    });
  });

  describe('Three-Level Referral Chain', () => {
    it('should create 3-level referral chain correctly', async () => {
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

      await request(app.getHttpServer() as Server)
        .post('/api/referral/register')
        .send({
          referralCode: userCResponse.body.referralCode,
        })
        .expect(201);

      const networkResponse = await request(app.getHttpServer() as Server)
        .get('/api/referral/network')
        .set('x-user-id', userAResponse.body.userId as string)
        .expect(200);

      expect(networkResponse.body.total).toBeGreaterThanOrEqual(1);
    });

    it('should reject registration beyond max depth', async () => {
      // Create chain: A -> B -> C -> D (D is at depth 3)
      const userAResponse = await request(app.getHttpServer() as Server)
        .post('/api/referral/generate')
        .send({})
        .expect(201);

      const userBResponse = await request(app.getHttpServer() as Server)
        .post('/api/referral/register')
        .send({ referralCode: userAResponse.body.referralCode })
        .expect(201);

      const userCResponse = await request(app.getHttpServer() as Server)
        .post('/api/referral/register')
        .send({ referralCode: userBResponse.body.referralCode })
        .expect(201);

      const userDResponse = await request(app.getHttpServer() as Server)
        .post('/api/referral/register')
        .send({ referralCode: userCResponse.body.referralCode })
        .expect(201);

      // Trying to register under D should fail (would be depth 4)
      await request(app.getHttpServer() as Server)
        .post('/api/referral/register')
        .send({ referralCode: userDResponse.body.referralCode })
        .expect(400);
    });
  });
});
