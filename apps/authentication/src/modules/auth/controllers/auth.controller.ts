import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { loadPemFromPath } from '@common/utils';

@Controller()
export class AuthController {
    private readonly refreshPrivateKey = loadPemFromPath(process.env.JWT_REFRESH_PRIVATE_KEY_PATH);

  constructor(
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
  ) {}

  @MessagePattern('auth.register')
  async register(@Payload() dto: RegisterDto) {
    if (!dto?.email || !dto?.password) {
      throw new RpcException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Email and password are required',
      });
    }
    try {
      return await this.auth.register(dto.email, dto.password);
    } catch (e: any) {
      throw new RpcException({
        statusCode: 409,
        error: 'Conflict',
        message: e?.message ?? 'Email already in use',
      });
    }
  }

  @MessagePattern('auth.login')
  async login(@Payload() dto: LoginDto) {
    if (!dto?.email || !dto?.password) {
      throw new RpcException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Email and password are required',
      });
    }
    const user = await this.auth.validateUser(dto.email, dto.password);
    if (!user) {
      throw new RpcException({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid credentials',
      });
    }
    return this.auth.login(user.id, user.email);
  }

   @MessagePattern('auth.refresh')
  async refresh(@Payload() dto: RefreshTokenDto) {
    if (!dto?.refreshToken) {
      throw new RpcException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'refreshToken is required',
      });
    }
    try {
      const payload = await this.jwt.verifyAsync(dto.refreshToken, {
        secret: this.refreshPrivateKey,
        algorithms: ['RS256'],
      });
      const userId: string = payload?.sub;
      const email: string = payload?.email;
      if (!userId || !email) {
        throw new RpcException({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid refresh token payload',
        });
      }
      return await this.auth.refreshTokens(userId, email, dto.refreshToken);
    } catch {
      throw new RpcException({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid refresh token',
      });
    }
  }

  @MessagePattern('auth.logout')
  async logout(@Payload() data: { userId: string }) {
    if (!data?.userId) {
      throw new RpcException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'userId is required',
      });
    }
    return this.auth.logout(data.userId);
  }


  @MessagePattern('auth.get_all_users')
  async getAllUsers() {
    return this.auth.getAllUsers();
  }
}