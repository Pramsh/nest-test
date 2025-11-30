import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';

// Mock the loadPemFromPath utility
jest.mock('@common/utils', () => ({
  loadPemFromPath: jest.fn(() => 'mocked-private-key'),
}));

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let cacheService: any;

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: '$2b$12$hashedPassword',
    refreshTokenHash: null,
    refreshJti: null,
    toObject: jest.fn().mockReturnValue({
      id: 'user-123',
      email: 'test@example.com',
      passwordHash: '$2b$12$hashedPassword',
    }),
  } as any;

  beforeEach(async () => {
    // Mock CacheService
    const mockCacheService = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
      keys: jest.fn().mockResolvedValue([]),
      ping: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            updateRefreshState: jest.fn(),
            rotateRefreshTokenAtomic: jest.fn(),
            updateRefreshTokenHash: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn(),
            decode: jest.fn(),
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: 'CACHE_SERVICE',
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    cacheService = module.get('CACHE_SERVICE');

    // Setup environment variables
    process.env.JWT_ACCESS_PRIVATE_KEY_PATH = '/path/to/access/key';
    process.env.JWT_REFRESH_PRIVATE_KEY_PATH = '/path/to/refresh/key';
    process.env.JWT_ACCESS_KID = 'access-v1';
    process.env.JWT_REFRESH_KID = 'refresh-v1';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should successfully register a new user', async () => {
      const email = 'newuser@example.com';
      const password = 'password123';

      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockUser);
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      

      (bcrypt.hash as jest.Mock).mockResolvedValueOnce('hashed-password').mockResolvedValueOnce('hashed-refresh-token');

      const result = await service.register(email, password);

      expect(usersService.findByEmail).toHaveBeenCalledWith(email);
      expect(usersService.create).toHaveBeenCalledWith({
        email,
        passwordHash: 'hashed-password',
      });
      expect(result).toMatchObject({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
      });
    });

    it('should throw UnauthorizedException if email already exists', async () => {
      const email = 'existing@example.com';
      const password = 'password123';

      usersService.findByEmail.mockResolvedValue(mockUser);

      await expect(service.register(email, password)).rejects.toThrow(
        new UnauthorizedException('Email already in use')
      );
    });
  });

  describe('validateUser', () => {
    it('should return user for valid credentials', async () => {
      const email = 'test@example.com';
      const password = 'password123';

      cacheService.get.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser(email, password);

      expect(result).toEqual(mockUser);
      expect(cacheService.set).toHaveBeenCalledTimes(2); // Cache user by email and id
    });

    it('should return null for invalid email', async () => {
      const email = 'nonexistent@example.com';
      const password = 'password123';

      cacheService.get.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.validateUser(email, password);

      expect(result).toBeNull();
    });

    it('should return null for invalid password', async () => {
      const email = 'test@example.com';
      const password = 'wrongpassword';

      cacheService.get.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser(email, password);

      expect(result).toBeNull();
    });

    it('should return cached user if available', async () => {
      const email = 'test@example.com';
      const password = 'password123';

      cacheService.get.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser(email, password);

      expect(result).toEqual(mockUser);
      expect(usersService.findByEmail).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should successfully login user', async () => {
      const userId = 'user-123';
      const email = 'test@example.com';

      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-refresh-token');

      const result = await service.login(userId, email);

      expect(cacheService.set).toHaveBeenCalledWith(
        `session:${userId}`,
        expect.objectContaining({ userId, email }),
        3600
      );
      expect(result).toMatchObject({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });
  });

  describe('logout', () => {
    it('should successfully logout user', async () => {
      const userId = 'user-123';

      cacheService.get.mockResolvedValue({ jti: 'jti-123' });

      const result = await service.logout(userId);

      expect(result).toEqual({ success: true });
      expect(usersService.updateRefreshTokenHash).toHaveBeenCalledWith(userId, null);
      expect(cacheService.del).toHaveBeenCalledWith([
        `session:${userId}`,
        `refresh:${userId}`,
        `user:${userId}`
      ]);
    });
  });

  describe('isUserActive', () => {
    it('should return true if user session exists in cache', async () => {
      const userId = 'user-123';
      cacheService.exists.mockResolvedValue(true);

      const result = await service.isUserActive(userId);

      expect(result).toBe(true);
      expect(cacheService.exists).toHaveBeenCalledWith(`session:${userId}`);
    });

    it('should return false if user session does not exist', async () => {
      const userId = 'user-123';
      cacheService.exists.mockResolvedValue(false);

      const result = await service.isUserActive(userId);

      expect(result).toBe(false);
    });
  });
});