import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UserRepository } from './user.repository';
import { User } from './entities/user.entity';

const mockUserModel = () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  exec: jest.fn(),
});

describe('UserRepository', () => {
  let repo: UserRepository;
  let userModel: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRepository,
        {
          provide: getModelToken(User.name),
          useFactory: mockUserModel,
        },
      ],
    }).compile();

    repo = module.get<UserRepository>(UserRepository);
    userModel = module.get(getModelToken(User.name));
  });

  it('should be defined', () => {
    expect(repo).toBeDefined();
  });

  describe('findByEmail', () => {
    it('should call findOne with normalized email', async () => {
      const exec = jest.fn().mockResolvedValue('user');
      userModel.findOne.mockReturnValue({ exec });
      const result = await repo.findByEmail('Test@Email.com ');
      expect(userModel.findOne).toHaveBeenCalledWith({ email: 'test@email.com' });
      expect(result).toBe('user');
    });
  });

  describe('findById', () => {
    it('should call findById', async () => {
      const exec = jest.fn().mockResolvedValue('user');
      userModel.findById.mockReturnValue({ exec });
      const result = await repo.findById('id');
      expect(userModel.findById).toHaveBeenCalledWith('id');
      expect(result).toBe('user');
    });
  });

  describe('create', () => {
    it('should create and save a user', async () => {
      const save = jest.fn().mockResolvedValue('savedUser');
      // Mock the userModel constructor for this test
      const mockConstructor = jest.fn(() => ({ save }));
      repo = new UserRepository(mockConstructor as any);
      const result = await repo.create({ email: 'A@B.com ', passwordHash: 'hash' });
      expect(result).toBe('savedUser');
      expect(mockConstructor).toHaveBeenCalledWith({
        email: 'a@b.com',
        passwordHash: 'hash',
      });
    });
  });

  describe('updateRefreshTokenHash', () => {
    it('should call findByIdAndUpdate', async () => {
      const exec = jest.fn().mockResolvedValue(undefined);
      userModel.findByIdAndUpdate.mockReturnValue({ exec });
      await repo.updateRefreshTokenHash('id', 'hash');
      expect(userModel.findByIdAndUpdate).toHaveBeenCalled();
    });
  });

  describe('updateRefreshState', () => {
    it('should call updateOne', async () => {
      userModel.updateOne.mockResolvedValue('updated');
      const result = await repo.updateRefreshState('id', { refreshTokenHash: 'h', refreshJti: 'j' });
      expect(userModel.updateOne).toHaveBeenCalledWith({ _id: 'id' }, { $set: { refreshTokenHash: 'h', refreshJti: 'j' } });
      expect(result).toBe('updated');
    });
  });

  describe('rotateRefreshTokenAtomic', () => {
    it('should return true if modifiedCount is 1', async () => {
      userModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      const result = await repo.rotateRefreshTokenAtomic('id', 'cH', 'cJ', 'nH', 'nJ');
      expect(result).toBe(true);
    });
    it('should return false if modifiedCount is not 1', async () => {
      userModel.updateOne.mockResolvedValue({ modifiedCount: 0 });
      const result = await repo.rotateRefreshTokenAtomic('id', 'cH', 'cJ', 'nH', 'nJ');
      expect(result).toBe(false);
    });
  });

  describe('getAllUsers', () => {
    it('should call find', async () => {
      const exec = jest.fn().mockResolvedValue(['user1', 'user2']);
      userModel.find.mockReturnValue({ exec });
      const result = await repo.getAllUsers();
      expect(userModel.find).toHaveBeenCalled();
      expect(result).toEqual(['user1', 'user2']);
    });
  });
});
