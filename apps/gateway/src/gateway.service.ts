import { Injectable } from '@nestjs/common';
import { InjectCache, CacheService } from '@common/cache';


@Injectable()
export class GatewayService {
  constructor(
    @InjectCache() private readonly cacheService: CacheService,
  ) {}


  // Health check method
  async healthCheck() {
    const cacheHealthy = await this.cacheService.ping();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      cache: cacheHealthy ? 'healthy' : 'unhealthy',
    };
  }

  // Rate limiting helper
  async checkRateLimit(key: string, limit: number = 10, windowSeconds: number = 60): Promise<boolean> {
    const current = await this.cacheService.get(`rate-limit:${key}`) || 0;
    if (current >= limit) {
      return false;
    }
    
    await this.cacheService.set(`rate-limit:${key}`, current + 1, windowSeconds);
    return true;
  }
}