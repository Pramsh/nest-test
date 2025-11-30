import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule } from '@nestjs/config';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { GatewayJwtStrategy } from './modules/auth/strategies/jwt.strategy';
import { PassportModule } from '@nestjs/passport';
import { GatewayRefreshJwtStrategy } from './modules/auth/strategies/jwt-refresh.strategy';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { FixedIpThrottlerGuard } from './modules/auth/guards/throttler.guard';
import { LoggerModule, DEFAULT_LOG_DB } from '@common/logger';
import { DatabaseModule } from '@common/database';
import { CacheModule } from '@common/cache';
import { AuthGatewayModule } from './modules/auth/auth.module';
import { UserGatewayModule } from './modules/user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['apps/gateway/.env.local', '.env'],
    }),
    PassportModule.register({ defaultStrategy: 'gateway-jwt' }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    DatabaseModule.forRoot({
      allowedCollections: [DEFAULT_LOG_DB]
    }),
    LoggerModule.forRoot({
      serviceName: 'GatewayService',
    }),
    CacheModule.forRoot({
      keyPrefix: 'gateway-service',
      ttl: 1800, // 30 minutes
    }),
    ClientsModule.register([
      {
        name: 'AUTH_SERVICE',
        transport: Transport.TCP,
        options: {
          host: process.env.AUTH_MS_HOST ?? '127.0.0.1',
          port: parseInt(process.env.AUTH_MS_PORT ?? '3000', 10),
        },
      },
    ]),
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
export class GatewayModule {}