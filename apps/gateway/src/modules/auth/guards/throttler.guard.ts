import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';

const seen = new Map<string, number>();

@Injectable()
export class FixedIpThrottlerGuard extends ThrottlerGuard {
  protected async handleRequest(reqProps: ThrottlerRequest): Promise<boolean> {
    const req = reqProps.context.switchToHttp().getRequest();
    const tracker = await this.getTracker(req as any);

    const key = this.generateKey(reqProps.context, tracker, 'default');

    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);

    return super.handleRequest(reqProps);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }
    const rawIp =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.ip ||
      req.connection?.remoteAddress ||
      'unknown';
    return rawIp.replace(/^::ffff:/, '');
  }
}