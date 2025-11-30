import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, InternalServerErrorException } from '@nestjs/common';
import { GatewayService } from '../src/gateway.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { RefreshJwtGuard } from '../src/modules/auth/guards/jwt-refresh.guard';
import { TimeoutError as RxTimeoutError } from 'rxjs';
import { AuthGatewayController } from '../src/modules/auth/auth.controller';
import { GatewayController } from '../src/gateway.controller';
import { UserGatewayController } from '../src/modules/user/user.controller';
import { AuthGatewayService } from '../src/modules/auth/auth.service';
import { SendService } from '../src/utils/rcp.send';
import { UserGatewayService } from '../src/modules/user/user.service';
import { User } from 'apps/authentication/src/modules/users/entities/user.entity';
import { UserGatewayModule } from '../src/modules/user/user.module';

// Only mock EXTERNAL dependencies (things your service doesn't control)
const mockAuthClient = {
  send: jest.fn(),
};

const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  ping: jest.fn(),
};

const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

const mockSendService = { send: jest.fn() };

describe('GatewayController', () => {
  let gatewayController: GatewayController;
  let authController: AuthGatewayController;
  let service: GatewayService; // Use REAL service

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthGatewayController, GatewayController, UserGatewayController],
      providers: [
        UserGatewayService,
        AuthGatewayService,
        GatewayService, // REAL service, not mocked!
        { provide: 'AUTH_SERVICE', useValue: mockAuthClient },
        { provide: 'logger_module', useValue: mockLogger },
        { provide: 'CACHE_SERVICE', useValue: mockCacheService },
        { provide: SendService, useValue: mockSendService }, 

      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(RefreshJwtGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    gatewayController = module.get<GatewayController>(GatewayController);
    authController = module.get<AuthGatewayController>(AuthGatewayController);
    service = module.get<GatewayService>(GatewayService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const registerDto = { email: 'test@example.com', password: 'password123' };
      const authResponse = { accessToken: 'token', user: { id: 1, email: 'test@example.com' } };
      
      // Mock external dependencies
      mockCacheService.get.mockResolvedValue(null); // No recent attempts
      mockSendService.send.mockResolvedValue(authResponse);
      mockCacheService.set.mockResolvedValue(undefined);

      // Call real authController method (which calls real service method)
      const result = await authController.register(registerDto);

      // Verify external calls happened as expected
      expect(mockCacheService.get).toHaveBeenCalledWith(`register:${registerDto.email}`);
      expect(mockSendService.send).toHaveBeenCalledWith('auth.register', registerDto);
      expect(mockCacheService.set).toHaveBeenCalledWith(`register:${registerDto.email}`, true, 300);
      
      // Verify business logic worked correctly
      expect(result).toEqual(authResponse);
    });

    it('should prevent spam registration attempts', async () => {
      const registerDto = { email: 'test@example.com', password: 'password123' };
      
      // Simulate recent registration attempt exists
      mockCacheService.get.mockResolvedValue(true);

      // Test that the REAL business logic throws the correct error
      await expect(authController.register(registerDto)).rejects.toThrow(
        new HttpException({
          statusCode: 429,
          message: 'Registration attempt too recent. Please wait before trying again.',
          error: 'Too Many Requests'
        }, 429)
      );

      // Verify the business logic logged the error
      expect(mockLogger.error).toHaveBeenCalledWith(`Rate limit hit for registration attempt: ${registerDto.email}`);
      
      // Verify it didn't try to call auth service
      expect(mockSendService.send).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should login user and clear failed attempts on success', async () => {
      const loginDto = { email: 'test@example.com', password: 'password123' };
      const authResponse = { accessToken: 'token', refreshToken: 'refresh' };
      
      mockCacheService.get.mockResolvedValue(2); // 2 previous failed attempts
      mockSendService.send.mockResolvedValue(authResponse);
      mockCacheService.del.mockResolvedValue(undefined);
      mockCacheService.set.mockResolvedValue(undefined);

      const result = await authController.login(loginDto);

      // Verify business logic: successful login clears failed attempts
      expect(mockCacheService.del).toHaveBeenCalledWith(`failed-login:${loginDto.email}`);
      
      // Verify business logic: successful login is cached
      expect(mockCacheService.set).toHaveBeenCalledWith(
        `last-login:${loginDto.email}`,
        expect.objectContaining({
          email: loginDto.email,
          userAgent: 'gateway',
        }),
        3600
      );
      
      expect(result).toEqual(authResponse);
    });

    it('should block login after 5 failed attempts', async () => {
      const loginDto = { email: 'test@example.com', password: 'password123' };
      
      mockCacheService.get.mockResolvedValue(5); // Already 5 failed attempts

      await expect(authController.login(loginDto)).rejects.toThrow(
        new HttpException({
          statusCode: 429,
          message: 'Too many failed login attempts. Please try again later.',
          error: 'Account Temporarily Locked'
        }, 429)
      );

      // Verify business logic: doesn't even try to authenticate
      expect(mockSendService.send).not.toHaveBeenCalled();
    });

    it('should increment failed attempts on authentication failure', async () => {
      const loginDto = { email: 'test@example.com', password: 'wrongpassword' };
      
      mockCacheService.get.mockResolvedValue(1); // 1 previous failed attempt
      const error = new Error('Invalid credentials');
      (error as any).statusCode = 401;
      mockSendService.send.mockRejectedValue(error);

      await expect(authController.login(loginDto)).rejects.toThrow();

      // Verify business logic: increments failed attempts
      expect(mockCacheService.set).toHaveBeenCalledWith(`failed-login:${loginDto.email}`, 2, 1800);
      expect(mockLogger.warn).toHaveBeenCalledWith(`Failed login attempt 2/5 for email: ${loginDto.email}`);
    });
  });

  describe('logout', () => {
    it('should logout user and clear cached data', async () => {
      const logoutDto = { userId: 'user123' };
      const authResponse = { success: true };
      mockSendService.send.mockResolvedValue(authResponse);
      mockCacheService.del.mockResolvedValue(undefined);
      mockCacheService.set.mockResolvedValue(undefined);
      const result = await authController.logout(logoutDto);
      // clears user cache data
      expect(mockCacheService.del).toHaveBeenCalledWith([
        `last-login:user:${logoutDto.userId}`,
        `user-session:${logoutDto.userId}`,
      ]);
      
      // Verify business logic: logs logout event
      expect(mockCacheService.set).toHaveBeenCalledWith(
        `logout:${logoutDto.userId}`,
        expect.objectContaining({
          logoutAt: expect.any(String),
        }),
        300
      );
      expect(result).toEqual(authResponse);
    });
  });

  describe('error handling', () => {
    it('should handle 500 errors as InternalServerErrorException', async () => {
      const loginDto = { email: 'test@example.com', password: 'password123' };
      mockCacheService.get.mockResolvedValue(0);
      mockSendService.send.mockRejectedValue(new InternalServerErrorException('Database connection failed'));
      await expect(authController.login(loginDto)).rejects.toThrow(InternalServerErrorException);
    });
  });

describe('UserGatewayController', () => {
  let userController: UserGatewayController;
  const mockUserGatewayService = {
  getAllUsers: jest.fn(),
};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
    controllers: [UserGatewayController],
    providers: [
      { provide: UserGatewayService, useValue: mockUserGatewayService },
    ]
  })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    userController = module.get<UserGatewayController>(UserGatewayController);
  });

  it('should return the user object for /user/me', () => {
    const mockUser = { id: 1, email: 'test@example.com', name: 'Test User' };
    const req = { user: mockUser };
    const result = userController.me(req);
    expect(result).toEqual(mockUser);
  });
});


  describe('health check', () => {
    it('should return healthy when cache is working', async () => {
      mockCacheService.ping.mockResolvedValue(true);
      const result = await gatewayController.healthCheck();
      expect(result).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
        cache: 'healthy',
      });
    });

    it('should return unhealthy when cache fails', async () => {
      mockCacheService.ping.mockResolvedValue(false);
      const result = await gatewayController.healthCheck();
      expect(result.cache).toBe('unhealthy');
    });
  });

  describe('rate limiting utility', () => {
    it('should allow requests within limit', async () => {
      mockCacheService.get.mockResolvedValue(5);
      mockCacheService.set.mockResolvedValue(undefined);
      const result = await service.checkRateLimit('test-key', 10, 60);
      expect(result).toBe(true);
      expect(mockCacheService.set).toHaveBeenCalledWith('rate-limit:test-key', 6, 60);
    });

    it('should reject requests over limit', async () => {
      mockCacheService.get.mockResolvedValue(10);
      const result = await service.checkRateLimit('test-key', 10, 60);
      expect(result).toBe(false);
      expect(mockCacheService.set).not.toHaveBeenCalled();
    });

    it('should handle null cache values correctly', async () => {
      mockCacheService.get.mockResolvedValue(null);
      const result = await service.checkRateLimit('test-key');
      expect(result).toBe(true);
      expect(mockCacheService.set).toHaveBeenCalledWith('rate-limit:test-key', 1, 60);
    });
  });
});