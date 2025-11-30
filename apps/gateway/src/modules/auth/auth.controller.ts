import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { AuthGatewayService } from './auth.service';
import { RefreshJwtGuard } from './guards/jwt-refresh.guard';

@Controller("auth")
export class AuthGatewayController {
  constructor(private readonly authGatewayService: AuthGatewayService) {}

  @Post('register')
  register(@Body() body: { email: string; password: string }) {
    return this.authGatewayService.register(body);
  }

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.authGatewayService.login(body); 
  }
  @Post('refresh')
  @UseGuards(RefreshJwtGuard)
  refresh(@Body() body: { refreshToken: string }) {
    return this.authGatewayService.refresh(body);
  }

  @Post('logout')
  logout(@Body() body: { userId: string }) {
    return this.authGatewayService.logout(body);
  }
}