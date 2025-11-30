import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../controllers/auth.controller';
import { AuthService } from '../auth.service';
import { JwtService } from '@nestjs/jwt';
import { RpcException } from '@nestjs/microservices';

// Mock loadPemFromPath to avoid env dependency in tests
jest.mock('@common/utils', () => ({
  loadPemFromPath: jest.fn(() => 'mocked-key'),
}));
// Mock dependencies
const mockAuthService = {
  register: jest.fn(),
  validateUser: jest.fn(),
  login: jest.fn(),
  refreshTokens: jest.fn(),
  logout: jest.fn(),
  getAllUsers: jest.fn(),
};

const mockJwtService = {
  verifyAsync: jest.fn(),
};

describe('AuthController', () => {
  let controller: AuthController;
  let authService: typeof mockAuthService;
  let jwtService: typeof mockJwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
    jwtService = module.get(JwtService);

    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should throw if email or password is missing', async () => {
      await expect(controller.register({ email: '', password: '' } as any)).rejects.toBeInstanceOf(RpcException);
    });
    it('should call authService.register', async () => {
      authService.register.mockResolvedValue('result');
      const dto = { email: 'a@b.com', password: '123' };
      await expect(controller.register(dto)).resolves.toBe('result');
      expect(authService.register).toHaveBeenCalledWith(dto.email, dto.password);
    });
    it('should throw RpcException on error', async () => {
      authService.register.mockRejectedValue(new Error('exists'));
      await expect(controller.register({ email: 'a@b.com', password: '123' })).rejects.toBeInstanceOf(RpcException);
    });
  });

  describe('login', () => {
    it('should throw if email or password is missing', async () => {
      await expect(controller.login({ email: '', password: '' } as any)).rejects.toBeInstanceOf(RpcException);
    });
    it('should throw if user not found', async () => {
      authService.validateUser.mockResolvedValue(null);
      await expect(controller.login({ email: 'a@b.com', password: '123' })).rejects.toBeInstanceOf(RpcException);
    });
    it('should call authService.login', async () => {
      authService.validateUser.mockResolvedValue({ id: '1', email: 'a@b.com' });
      authService.login.mockResolvedValue('token');
      await expect(controller.login({ email: 'a@b.com', password: '123' })).resolves.toBe('token');
    });
  });

  describe('refresh', () => {
    it('should throw if refreshToken is missing', async () => {
      await expect(controller.refresh({ refreshToken: '' } as any)).rejects.toBeInstanceOf(RpcException);
    });
    it('should throw if payload is invalid', async () => {
      jwtService.verifyAsync.mockResolvedValue({});
      await expect(controller.refresh({ refreshToken: 'token' })).rejects.toBeInstanceOf(RpcException);
    });
    it('should call authService.refreshTokens', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: '1', email: 'a@b.com' });
      authService.refreshTokens.mockResolvedValue('newTokens');
      await expect(controller.refresh({ refreshToken: 'token' })).resolves.toBe('newTokens');
    });
    it('should throw on jwtService error', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('fail'));
      await expect(controller.refresh({ refreshToken: 'token' })).rejects.toBeInstanceOf(RpcException);
    });
  });

  describe('logout', () => {
    it('should throw if userId is missing', async () => {
      await expect(controller.logout({ userId: '' } as any)).rejects.toBeInstanceOf(RpcException);
    });
    it('should call authService.logout', async () => {
      authService.logout.mockResolvedValue('ok');
      await expect(controller.logout({ userId: '1' })).resolves.toBe('ok');
    });
  });

  describe('getAllUsers', () => {
    it('should call authService.getAllUsers', async () => {
      authService.getAllUsers.mockResolvedValue(['user1', 'user2']);
      await expect(controller.getAllUsers()).resolves.toEqual(['user1', 'user2']);
    });
  });
});
