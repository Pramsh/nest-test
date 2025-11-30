import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } from '../common/constants/token.constants';
import { randomUUID } from 'crypto';
import { loadPemFromPath } from '@common/utils';
import { InjectCache, CacheService } from '@common/cache';

@Injectable()
export class AuthService {
  private readonly accessPrivateKey: string;
  private readonly refreshPrivateKey: string;
  private readonly accessKid?: string;
  private readonly refreshKid?: string;

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    @InjectCache() private readonly cacheService: CacheService,
  ) {
    this.accessPrivateKey = loadPemFromPath(process.env.JWT_ACCESS_PRIVATE_KEY_PATH);
    this.refreshPrivateKey = loadPemFromPath(process.env.JWT_REFRESH_PRIVATE_KEY_PATH);
    this.accessKid = process.env.JWT_ACCESS_KID || 'access-v1';
    this.refreshKid = process.env.JWT_REFRESH_KID || 'refresh-v1';
  }

  async register(email: string, password: string) {    
    const exist = await this.users.findByEmail(email);
    
    if (exist) {
      throw new UnauthorizedException('Email already in use');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.users.create({ email, passwordHash });
    
    // Cache user data for quick access
     
    await this.cacheService.set(`user:${user.id}`, {
        id: user.id,
        email: user.email,
      }, 3600); // 1 hour
    
    return this.issueTokenPair(user.id, user.email);
  }

  async validateUser(email: string, password: string) {
    // Try to get user from cache first
    const cachedUser = await this.cacheService.get(`user:email:${email}`);
    let user = cachedUser;
  
    if (!user) {
      user = await this.users.findByEmail(email);
      if (user) {
        // Cache user for future lookups
        await this.cacheService.set(`user:email:${email}`, user.toObject(), 1800); // 30 minutes
        await this.cacheService.set(`user:${user.id}`, user, 1800);
      }
    }
    
    if (!user) return null;
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return null;
    return user;
  }

  async login(userId: string, email: string) {
    // Cache active session
    await this.cacheService.set(`session:${userId}`, {
      userId,
      email,
      loginAt: new Date().toISOString(),
    }, 3600); // 1 hour
    
    return this.issueTokenPair(userId, email);
  }

 private async signAccessToken(userId: string, email: string) {
    const payload = { sub: userId, email };
    return this.jwt.signAsync(payload, {
      secret: this.accessPrivateKey,
      algorithm: 'RS256',
      expiresIn: ACCESS_TOKEN_TTL,
      keyid: this.accessKid,
    });
  }

  private async signRefreshToken(userId: string, email: string) {
    const jti = randomUUID();
    const payload = { sub: userId, email, jti };
    const token = await this.jwt.signAsync(payload, {
      secret: this.refreshPrivateKey,
      algorithm: 'RS256',
      expiresIn: REFRESH_TOKEN_TTL,
      keyid: this.refreshKid,
    });
    return { token, jti };
  }

  async issueTokenPair(userId: string, email: string) {
    const accessToken = await this.signAccessToken(userId, email);
    const { token: refreshToken, jti } = await this.signRefreshToken(userId, email);

    const refreshTokenHash = await bcrypt.hash(refreshToken, 12);
    
    await this.users.updateRefreshState(userId, { refreshTokenHash, refreshJti: jti });
    
    // Cache refresh token metadata
    await this.cacheService.set(`refresh:${userId}`, {
      jti,
      issuedAt: new Date().toISOString(),
    }, parseInt(REFRESH_TOKEN_TTL)); // Match token expiry

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL,
      kid: this.accessKid,
    };
  }

  async refreshTokens(userId: string, email: string, providedRefreshToken: string) {
    const user = await this.users.findById(userId);
    if (!user?.refreshTokenHash || !user?.refreshJti) {
      throw new UnauthorizedException('No refresh token stored');
    }

    // Extract jti from the provided token to prevent replay
    const decoded: any = this.jwt.decode(providedRefreshToken);
    const providedJti: string | undefined = decoded?.jti;
    if (!providedJti || providedJti !== user.refreshJti) {
      throw new UnauthorizedException('Refresh token mismatch');
    }
    
    // Check if token is blacklisted
    const isBlacklisted = await this.cacheService.exists(`blacklist:refresh:${providedJti}`);
    if (isBlacklisted) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }
    
    // Integrity check: full string hash compare
    const valid = await bcrypt.compare(providedRefreshToken, user.refreshTokenHash);
    if (!valid) throw new UnauthorizedException('Invalid refresh token');

    // Sign the next pair
    const accessToken = await this.signAccessToken(userId, email);
    const { token: nextRefreshToken, jti: nextJti } = await this.signRefreshToken(userId, email);
    const nextHash = await bcrypt.hash(nextRefreshToken, 12);

    // Atomic rotate: only update if current (hash,jti) is still the same
    const rotated = await this.users.rotateRefreshTokenAtomic(
      userId,
      user.refreshTokenHash,
      user.refreshJti,
      nextHash,
      nextJti,
    );
    if (!rotated) {
      throw new UnauthorizedException('Concurrent refresh detected; please retry');
    }

    // Blacklist the old refresh token
    await this.cacheService.set(`blacklist:refresh:${providedJti}`, true, parseInt(REFRESH_TOKEN_TTL));
    
    // Cache new refresh token metadata
    await this.cacheService.set(`refresh:${userId}`, {
      jti: nextJti,
      issuedAt: new Date().toISOString(),
    }, parseInt(REFRESH_TOKEN_TTL));

    return {
      accessToken,
      refreshToken: nextRefreshToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL,
      kid: this.accessKid,
    };
  }

  async logout(userId: string) {
    await this.users.updateRefreshTokenHash(userId, null);
    
    // Clear all cached data for this user
    await this.cacheService.del([
      `session:${userId}`,
      `refresh:${userId}`,
      `user:${userId}`
    ]);
    
    // Find and blacklist any active refresh tokens
    const refreshData = await this.cacheService.get(`refresh:${userId}`);
    if (refreshData?.jti) {
      await this.cacheService.set(`blacklist:refresh:${refreshData.jti}`, true, parseInt(REFRESH_TOKEN_TTL));
    }
    
    return { success: true };
  }

  // New method to check if user is active
  async isUserActive(userId: string): Promise<boolean> {
    return await this.cacheService.exists(`session:${userId}`);
  }

  // New method to revoke all sessions for a user
  async revokeAllSessions(userId: string) {
    const refreshData = await this.cacheService.get(`refresh:${userId}`);
    if (refreshData?.jti) {
      await this.cacheService.set(`blacklist:refresh:${refreshData.jti}`, true, parseInt(REFRESH_TOKEN_TTL));
    }
    
    await this.cacheService.del([
      `session:${userId}`,
      `refresh:${userId}`,
      `user:${userId}`
    ]);
    
    await this.users.updateRefreshTokenHash(userId, null);
    return { success: true };
  }

  async getAllUsers() {
    return this.users.getAllUsers();
  }
}