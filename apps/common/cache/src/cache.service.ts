import { Injectable, Inject } from '@nestjs/common';
import { CACHE_CONNECTION } from './cache.constants';

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  ttl?: number;
}

@Injectable()
export class CacheService {
  private client: any;
  private config: CacheConfig;
  private keyPrefix: string;
  private defaultTtl: number;

  constructor(@Inject(CACHE_CONNECTION) config: CacheConfig) {
    this.config = config;
    this.keyPrefix = config.keyPrefix || '';
    this.defaultTtl = config.ttl || 3600; // 1 hour default
    this.initializeRedisClient();
  }

  private initializeRedisClient(): void {
    try {
      const Redis = require('ioredis');
      this.client = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db || 0,
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
      });

      this.client.on('connect', () => {
        console.log(`[CacheService] Connected to Redis at ${this.config.host}:${this.config.port}`);
      });

      this.client.on('error', (err: any) => {
        console.error('[CacheService] Redis connection error:', err);
      });
    } catch (error) {
      console.error('[CacheService] Failed to initialize Redis client:', error);
    }
  }

  private getKey(key: string): string {
    return this.keyPrefix ? `${this.keyPrefix}:${key}` : key;
  }

  async get<T = any>(key: string): Promise<T | null> {
    try {
      if (!this.client) return null;
      
      const value = await this.client.get(this.getKey(key));
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`[CacheService] Error getting key "${key}":`, error);
      return null;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      if (!this.client) return false;
      
      const serializedValue = JSON.stringify(value);
      const expirationTime = ttl || this.defaultTtl;
      
      await this.client.setex(this.getKey(key), expirationTime, serializedValue);
      return true;
    } catch (error) {
      console.error(`[CacheService] Error setting key "${key}":`, error);
      return false;
    }
  }

  async del(key: string | string[]): Promise<boolean> {
    try {
      if (!this.client) return false;
      
      const keys = Array.isArray(key) ? key.map(k => this.getKey(k)) : [this.getKey(key)];
      await this.client.del(...keys);
      return true;
    } catch (error) {
      console.error(`[CacheService] Error deleting key(s):`, error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      if (!this.client) return false;
      
      const result = await this.client.exists(this.getKey(key));
      return result === 1;
    } catch (error) {
      console.error(`[CacheService] Error checking if key "${key}" exists:`, error);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      if (!this.client) return -1;
      
      return await this.client.ttl(this.getKey(key));
    } catch (error) {
      console.error(`[CacheService] Error getting TTL for key "${key}":`, error);
      return -1;
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      if (!this.client) return false;
      
      const result = await this.client.expire(this.getKey(key), seconds);
      return result === 1;
    } catch (error) {
      console.error(`[CacheService] Error setting expiration for key "${key}":`, error);
      return false;
    }
  }

  async keys(pattern: string = '*'): Promise<string[]> {
    try {
      if (!this.client) return [];
      
      const searchPattern = this.keyPrefix ? `${this.keyPrefix}:${pattern}` : pattern;
      const keys = await this.client.keys(searchPattern);
      
      // Remove prefix from returned keys
      if (this.keyPrefix) {
        const prefixLength = this.keyPrefix.length + 1;
        return keys.map((key: string) => key.substring(prefixLength));
      }
      
      return keys;
    } catch (error) {
      console.error(`[CacheService] Error getting keys with pattern "${pattern}":`, error);
      return [];
    }
  }

  async flush(): Promise<boolean> {
    try {
      if (!this.client) return false;
      
      await this.client.flushdb();
      return true;
    } catch (error) {
      console.error('[CacheService] Error flushing cache:', error);
      return false;
    }
  }

  async increment(key: string, value: number = 1): Promise<number | null> {
    try {
      if (!this.client) return null;
      
      return await this.client.incrby(this.getKey(key), value);
    } catch (error) {
      console.error(`[CacheService] Error incrementing key "${key}":`, error);
      return null;
    }
  }

  async decrement(key: string, value: number = 1): Promise<number | null> {
    try {
      if (!this.client) return null;
      
      return await this.client.decrby(this.getKey(key), value);
    } catch (error) {
      console.error(`[CacheService] Error decrementing key "${key}":`, error);
      return null;
    }
  }

  // Hash operations
  async hset(key: string, field: string, value: any): Promise<boolean> {
    try {
      if (!this.client) return false;
      
      const serializedValue = JSON.stringify(value);
      await this.client.hset(this.getKey(key), field, serializedValue);
      return true;
    } catch (error) {
      console.error(`[CacheService] Error setting hash field "${field}" in key "${key}":`, error);
      return false;
    }
  }

  async hget<T = any>(key: string, field: string): Promise<T | null> {
    try {
      if (!this.client) return null;
      
      const value = await this.client.hget(this.getKey(key), field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`[CacheService] Error getting hash field "${field}" from key "${key}":`, error);
      return null;
    }
  }

  async hgetall<T = Record<string, any>>(key: string): Promise<T | null> {
    try {
      if (!this.client) return null;
      
      const hash = await this.client.hgetall(this.getKey(key));
      if (!hash || Object.keys(hash).length === 0) return null;
      
      // Parse all JSON values
      const parsedHash: Record<string, any> = {};
      for (const [field, value] of Object.entries(hash)) {
        try {
          parsedHash[field] = JSON.parse(value as string);
        } catch {
          parsedHash[field] = value;
        }
      }
      
      return parsedHash as T;
    } catch (error) {
      console.error(`[CacheService] Error getting hash "${key}":`, error);
      return null;
    }
  }

  async hdel(key: string, field: string | string[]): Promise<boolean> {
    try {
      if (!this.client) return false;
      
      const fields = Array.isArray(field) ? field : [field];
      await this.client.hdel(this.getKey(key), ...fields);
      return true;
    } catch (error) {
      console.error(`[CacheService] Error deleting hash field(s) from key "${key}":`, error);
      return false;
    }
  }

  // Utility method to check connection
  async ping(): Promise<boolean> {
    try {
      if (!this.client) return false;
      
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('[CacheService] Ping failed:', error);
      return false;
    }
  }

  // Graceful shutdown
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
  }
}