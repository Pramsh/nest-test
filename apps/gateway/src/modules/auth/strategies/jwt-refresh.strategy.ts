import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from '@common/logger';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { loadPemFromPath } from '@common/utils';

interface RefreshJwtPayload {
  sub: string;
  email: string;
  jti?: string;
}


@Injectable()
export class GatewayRefreshJwtStrategy extends PassportStrategy(Strategy, 'gateway-refresh-jwt') {
  private keyStore: Record<string, string> = {};
  private defaultKid: string;

  constructor(
    private readonly config: ConfigService,
    @Inject("logger_module") private readonly logger: Logger

  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      secretOrKeyProvider: (_req, rawJwt: string, done) => {
        try {
          const [headerB64] = rawJwt.split('.');
            const headerJson = Buffer.from(headerB64, 'base64url').toString('utf8');
          const header = JSON.parse(headerJson);
          const kid = header.kid || this.defaultKid;
          const key = this.keyStore[kid];
          if (!key) return done(new Error(`Refresh public key for kid=${kid} not loaded`), null);
          done(null, key);
        } catch (e) {
          done(e as Error, null);
        }
      },
    });
    console.log("Initializing GatewayRefreshJwtStrategyyyy",this.config);
    this.defaultKid = this.config.get<string>('JWT_REFRESH_KID') || 'refresh-v1';
    this.loadKeys();
  }

  private loadKeys() {
    const main = process.env.JWT_REFRESH_PUBLIC_KEY_PATH
    if (!main) {
      this.logger.error('JWT_REFRESH_PUBLIC_KEY_PATH missing');
      return;
    }
    this.keyStore[this.defaultKid] = loadPemFromPath(main);
  }

  async validate(payload: RefreshJwtPayload) {
    return {
      userId: payload.sub,
      email: payload.email,
      jti: payload.jti,
    };
  }
}