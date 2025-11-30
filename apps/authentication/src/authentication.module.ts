import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DatabaseModule } from 'apps/common/database/src';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from '@common/logger';
import { CacheModule } from '@common/cache';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        'apps/authentication/.env.local', // per-app (optional)
        '.env',                     // root fallback
      ],
    }),
    DatabaseModule.forRoot(),
    LoggerModule.forRoot({
      serviceName: 'AuthService'
    }),
    CacheModule.forRoot({
      keyPrefix: 'auth-service',
      ttl: 1800, // 30 minutes
    }),
    AuthModule,
    UsersModule
  ],
})
export class AuthenticationModule {}
