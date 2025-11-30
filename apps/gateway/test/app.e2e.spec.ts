import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { GatewayController } from '../src/gateway.controller';
import { GatewayService } from '../src/gateway.service';
import { PassportModule } from '@nestjs/passport';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@common/cache';
import { LoggerModule } from '@common/logger';
import { DatabaseModule } from '@common/database'; // Add this back
import { APP_GUARD } from '@nestjs/core';
import { FixedIpThrottlerGuard } from '../src/modules/auth/guards/throttler.guard';
import * as Redis from 'ioredis';
import { GatewayRefreshJwtStrategy } from '../src/modules/auth/strategies/jwt-refresh.strategy';
import { GatewayJwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import path from 'path/win32';
import { AuthGatewayModule } from '../src/modules/auth/auth.module';
import { UserGatewayModule } from '../src/modules/user/user.module';

describe('Full Integration Test', () => {
  let app: INestApplication;
  let redis: Redis.Redis;

  beforeAll(async () => {

    process.env.LOG_DISABLE_DB = 'true';
    
    // Connect to real infrastructure
    redis = new Redis.Redis({
      host: 'localhost',
      port: 6379,
      password: 'devpassword',
      db: 1,
    });

    await redis.flushdb();

    const moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: [path.join(__dirname, '../.env.local')],
        }),
        PassportModule.register({ defaultStrategy: 'gateway-jwt' }),
        ThrottlerModule.forRoot([{
          ttl: 60000, // 1 minute
          limit: 10,  // 10 requests per minute
        }]),
        // Add DatabaseModule back with local MongoDB
        DatabaseModule.forRoot({
          uri: 'mongodb://admin:devpassword@localhost:27017/test_test?authSource=admin',
          dbName: 'test_test'
        }),
        LoggerModule.forRoot({
          serviceName: 'GatewayService',
        }),
        CacheModule.forRoot({
          keyPrefix: 'gateway-service',
          ttl: 1800,
        }),
        ClientsModule.register([{
          name: 'AUTH_SERVICE',
          transport: Transport.TCP,
          options: {
            host: 'localhost',
            port: 3000,
          },
        }]),
        AuthGatewayModule,
        UserGatewayModule
      ],
      controllers: [GatewayController],
      providers: [
        GatewayService,
        { provide: APP_GUARD, useClass: FixedIpThrottlerGuard },
          GatewayJwtStrategy,
        GatewayRefreshJwtStrategy,

      ],
    })
    .overrideProvider('CACHE_CONNECTION')
    .useValue({
      host: 'localhost',
      port: 6379,
      password: 'devpassword',
      db: 1,
      keyPrefix: 'test-gateway',
      ttl: 300
    })
    .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 60000);

  afterAll(async () => {
    if (redis) await redis.quit();
    if (app) await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  it('should register with real authentication service', async () => {
    const email = `integration${Date.now()}@example.com`;
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ 
        email, 
        password: 'securepassword123' 
      })
      .expect(201);

    expect(response.body.accessToken).toBeDefined();
    expect(typeof response.body.accessToken).toBe('string');
  });

  it('should login with real authentication service', async () => {
    const email = `integration${Date.now()}@example.com`;
    // First register a user (this stores in MongoDB)
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ 
        email, 
        password: 'testpassword123' 
      })
      .expect(201);

    // Then try to login with same credentials (this reads from MongoDB)
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ 
        email, 
        password: 'testpassword123' 
      })
      .expect(201);

    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();
  });


  

  it('should refresh token and invalidate old refresh-token', async () => {
    const email = `refresh${Date.now()}@example.com`;
    
    const registrationResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ 
        email, 
        password: 'testpassword123' 
      })
      .expect(201);

    expect(registrationResponse.body.accessToken).toBeDefined();
    expect(registrationResponse.body.refreshToken).toBeDefined();
    
    console.log('Waiting before retrying refresh token...', registrationResponse.body.refreshToken);
    const refreshResponse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ 
        refreshToken: registrationResponse.body.refreshToken
      })
      .expect(201);

    expect(refreshResponse.body.accessToken).toBeDefined();
    expect(refreshResponse.body.refreshToken).toBeDefined();
      // Try using the old refresh token again - should fail
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ 
          refreshToken: registrationResponse.body.refreshToken 
        })
        .expect(401);
  })

  it('should fail login with wrong credentials', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ 
        email: 'nonexistent@example.com', 
        password: 'wrongpassword' 
      })
      .expect(401);
  });

   it('should show error for duplicate registration', async () => {
    const email = `duplicate${Date.now()}@example.com`;
    // First registration should succeed
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123' })
      .expect(201);

    // Second registration with same email should fail
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123' });

    expect(response.status).toBe(429);
    expect(response.body.message).toMatch(/Registration attempt too recent. Please wait before trying again./i);
  });

  it('should show error for invalid email format', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'invalid-email', password: 'password123' });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/Bad Request Exception/i);
  });


  it('should return a list of users if an authenticated user tries to retrieve and error if unauthenticated tries', async () => {
    const userRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: `listusers${Date.now()}@example.com`, password: 'password123' })
      .expect(201);
      
    const usersRes = await request(app.getHttpServer())
      .get('/user/users')
      .set('Authorization', `Bearer ${userRes.body.accessToken}`)
      .expect(200);
      
    expect(usersRes.body).toBeInstanceOf(Array);
    expect(usersRes.body.length).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .get('/user/users')
      .expect(401);
  });

  
  it('should return user info for /me with valid JWT', async () => {
    const email = `me${Date.now()}@example.com`;
    const password = 'testpassword123';

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    const accessToken = loginResponse.body.accessToken;
    expect(accessToken).toBeDefined();
    
    const meResponse = await request(app.getHttpServer())
      .get('/user/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(meResponse.body).toBeDefined();
    expect(meResponse.body.email).toBe(email);
    // Optionally check for other user fields if present
  });

   it('should rate limit multiple requests from same IP', async () => {
    const responses: any[] = [];
    const emailBase = `ratelimit${Date.now()}`;
    
    // Make 15 requests rapidly from the same IP
    for (let i = 0; i < 15; i++) {
      try {
        const response = await request(app.getHttpServer())
          .post('/auth/register')
          .send({ 
            email: `${emailBase}${i}@example.com`, // Use unique emails to avoid duplicate error
            password: 'password123' 
          });
        responses.push({ status: response.status });
        console.log(`Request ${i + 1}: ${response.status}`);
      } catch (error: any) {
        responses.push({ status: error.status || 500 });
        console.log(`Request ${i + 1}: Error ${error.status}`);
      }
      await new Promise(resolve => setTimeout(resolve, 30)); // Small delay
    }

    const successfulRequests = responses.filter(res => res.status === 201);
    const rateLimitedRequests = responses.filter(res => res.status === 429);

    console.log(`Final results - Successful: ${successfulRequests.length}, Rate limited: ${rateLimitedRequests.length}`);

    expect(rateLimitedRequests.length).toBeGreaterThan(0);
    expect(successfulRequests.length).toBeLessThanOrEqual(10);
  }, 30000);

 
});