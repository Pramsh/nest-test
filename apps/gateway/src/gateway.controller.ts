import { Controller, Get } from '@nestjs/common';
import { GatewayService } from './gateway.service';

@Controller()
export class GatewayController {
  constructor(private readonly gatewayService: GatewayService) {}

  @Get('cache-health')
  async healthCheck() {
    return this.gatewayService.healthCheck();
  }

  @Get('ping')
  ping() { return { ok: true, ts: Date.now() }; }


}