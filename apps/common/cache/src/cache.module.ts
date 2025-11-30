import { Module, Global, DynamicModule } from '@nestjs/common';
import { CacheService, CacheConfig } from './cache.service';
import { CACHE_CONNECTION, CACHE_SERVICE } from './cache.constants';

export interface CacheModuleOptions {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  ttl?: number;
  disabled?: boolean;
}

@Global()
@Module({})
export class CacheModule {
  static forRoot(options: CacheModuleOptions = {}): DynamicModule {
    const config: CacheConfig = {
      host: options.host || process.env.REDIS_HOST || 'localhost',
      port: options.port || parseInt(process.env.REDIS_PORT || '6379'),
      password: options.password || process.env.REDIS_PASSWORD,
      db: options.db || parseInt(process.env.REDIS_DB || '0'),
      keyPrefix: options.keyPrefix || process.env.REDIS_KEY_PREFIX,
      ttl: options.ttl || parseInt(process.env.REDIS_DEFAULT_TTL || '3600'),
    };

    return {
      module: CacheModule,
      providers: [
        {
          provide: CACHE_CONNECTION,
          useValue: config,
        },
        {
          provide: CACHE_SERVICE,
          useClass: options.disabled ? MockCacheService : CacheService,
        },
      ],
      exports: [CACHE_SERVICE, CACHE_CONNECTION],
      global: true,
    };
  }
}

// Mock service for when cache is disabled
class MockCacheService {
  async get(): Promise<null> { return null; }
  async set(): Promise<boolean> { return true; }
  async del(): Promise<boolean> { return true; }
  async exists(): Promise<boolean> { return false; }
  async ttl(): Promise<number> { return -1; }
  async expire(): Promise<boolean> { return true; }
  async keys(): Promise<string[]> { return []; }
  async flush(): Promise<boolean> { return true; }
  async increment(): Promise<number> { return 1; }
  async decrement(): Promise<number> { return 0; }
  async hset(): Promise<boolean> { return true; }
  async hget(): Promise<null> { return null; }
  async hgetall(): Promise<null> { return null; }
  async hdel(): Promise<boolean> { return true; }
  async ping(): Promise<boolean> { return true; }
  async disconnect(): Promise<void> { }
}