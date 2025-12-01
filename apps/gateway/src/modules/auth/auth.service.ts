import type { Logger } from '@common/logger';
import { Inject, Injectable, HttpException } from '@nestjs/common';
import { InjectCache, CacheService } from '@common/cache';
import { SendService } from '../../utils/rcp.send';


@Injectable()
export class AuthGatewayService {
  constructor(
    @Inject('logger_module') private readonly logger: Logger,
    @InjectCache() private readonly cacheService: CacheService,
    private readonly sendService: SendService,
  ) {}


  async register(body: { email: string; password: string }) {
    // Check for recent registration attempts to prevent spam
    const recentAttempt = await this.cacheService.get(`register:${body.email}`);
    if (recentAttempt) {
      this.logger.error(`Rate limit hit for registration attempt: ${body.email}`);
      throw new HttpException({ 
        statusCode: 429, 
        message: 'Registration attempt too recent. Please wait before trying again.',
        error: 'Too Many Requests' 
      }, 429);
    }

    // Set rate limit cache
    await this.cacheService.set(`register:${body.email}`, true, 300); // 5 minutes

    const result = await this.sendService.send<typeof body, any>('auth.register', body);
    
    // Cache successful registration info (without sensitive data)
    if (result?.accessToken) {
      await this.cacheService.set(`recent-registration:${body.email}`, {
        email: body.email,
        registeredAt: new Date().toISOString(),
      }, 3600); // 1 hour
    }

    return result;
  }

  async login(body: { email: string; password: string }) {
    // Check for recent failed login attempts
    const failedAttempts = await this.cacheService.get(`failed-login:${body.email}`) || 0;
    if (failedAttempts >= 5) {
      throw new HttpException({ 
        statusCode: 429, 
        message: 'Too many failed login attempts. Please try again later.',
        error: 'Account Temporarily Locked' 
      }, 429);
    }    

    try {
      const result = await this.sendService.send<typeof body, any>('auth.login', body);
      
      // Clear failed attempts on successful login
      await this.cacheService.del(`failed-login:${body.email}`);
      
      // Cache successful login info
      if (result?.accessToken) {
        await this.cacheService.set(`last-login:${body.email}`, {
          email: body.email,
          loginAt: new Date().toISOString(),
          userAgent: 'gateway', // You can pass this from request headers
        }, 3600); // 1 hour
      }

      return result;
    } catch (error) {
      const newFailedCount = failedAttempts + 1;
      await this.cacheService.set(`failed-login:${body.email}`, newFailedCount, 1800); // 30 minutes
      
      this.logger.warn(`Failed login attempt ${newFailedCount}/5 for email: ${body.email}`);
      
      throw error;
    }
  }

  async refresh(body: { refreshToken: string }) {
    try {      
      const result = await this.sendService.send<typeof body, any>('auth.refresh', body);
      // Cache refresh event for monitoring
      if (result?.accessToken) {
        await this.cacheService.set(`token-refresh:${Date.now()}`, {
          refreshedAt: new Date().toISOString(),
        }, 300); // 5 minutes for monitoring
      }

      return result;
    } catch (error) {
      // Log suspicious refresh attempts
      this.logger.warn('Failed refresh token attempt');
      throw error;
    }
  }

  async logout(body: { userId: string }) {
    const result = await this.sendService.send<typeof body, any>('auth.logout', body);
    
    // Clear all cached data for this user
    await this.cacheService.del([
      `last-login:user:${body.userId}`,
      `user-session:${body.userId}`,
    ]);
    
    // Cache logout event
    await this.cacheService.set(`logout:${body.userId}`, {
      logoutAt: new Date().toISOString(),
    }, 300); // 5 minutes

    return result;
  }

  // Utility methods for cache management
  async getUserLastLogin(email: string) {
    return await this.cacheService.get(`last-login:${email}`);
  }

  async getFailedLoginAttempts(email: string): Promise<number> {
    return await this.cacheService.get(`failed-login:${email}`) || 0;
  }

  async clearFailedLoginAttempts(email: string) {
    await this.cacheService.del(`failed-login:${email}`);
  }

  async getRecentRegistrations(): Promise<string[]> {
    return await this.cacheService.keys('recent-registration:*');
  }

}