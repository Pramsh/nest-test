import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { JwtPayload } from '@common/auth';

@Injectable()
export class GatewayJwtStrategy extends PassportStrategy(Strategy, 'gateway-jwt') {
  private readonly logger = new Logger(GatewayJwtStrategy.name);
  private keyStore: Record<string, string> = {};
  private defaultKid: string;

  constructor(private readonly config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      secretOrKeyProvider: (request, rawJwt, done) => {
        try {
          const [headerB64] = rawJwt.split('.');
          const headerJson = Buffer.from(headerB64, 'base64url').toString('utf8');
          const header = JSON.parse(headerJson);
          const kid = header.kid || this.defaultKid;
          const key = this.keyStore[kid];
          if (!key) {
            return done(new Error(`Public key for kid=${kid} not loaded`), null);
          }
          done(null, key);
        } catch (err) {
          done(err as Error, null);
        }
      },
    });

    this.defaultKid = this.config.get<string>('JWT_ACCESS_KID') || 'access-v1';
    this.loadKeys();
  }

  private loadKeys() {
    const keyPath = this.config.get<string>('JWT_ACCESS_PUBLIC_KEY_PATH');
    if (!keyPath) {
      // Don’t throw immediately; log and let first request surface it with clear error
      this.logger.error(
        'JWT_ACCESS_PUBLIC_KEY_PATH is missing. Set it in apps/gateway/.env.local or root .env.',
      );
      return;
    }
    const abs = path.isAbsolute(keyPath) ? keyPath : path.resolve(process.cwd(), keyPath);
    if (!fs.existsSync(abs)) {
      this.logger.error(`Public key file not found at resolved path: ${abs}`);
      return;
    }
    try {
      const pem = fs.readFileSync(abs, 'utf8');
      this.keyStore[this.defaultKid] = pem;

      // Optional: load rotation key
      const v2Path = this.config.get<string>('JWT_ACCESS_PUBLIC_KEY_PATH_V2');
      if (v2Path) {
        const abs2 = path.isAbsolute(v2Path) ? v2Path : path.resolve(process.cwd(), v2Path);
        if (fs.existsSync(abs2)) {
          const pem2 = fs.readFileSync(abs2, 'utf8');
            this.keyStore['access-v2'] = pem2;
        } else {
          this.logger.warn(`Rotation key path provided but file missing: ${abs2}`);
        }
      }

      this.logger.log(
        `Loaded ${Object.keys(this.keyStore).length} public key(s): ${Object.keys(this.keyStore).join(', ')}`,
      );
    } catch (e) {
      this.logger.error('Failed to read public key file', e as Error);
    }
  }

  async validate(payload: JwtPayload) {
    return {
      userId: payload.sub,
      email: payload.email,
    };
  }
}