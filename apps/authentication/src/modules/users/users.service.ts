import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(private readonly repo: UserRepository) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.repo.findByEmail(email);
  }

  async findById(id: string): Promise<User | null> {
    return this.repo.findById(id);
  }

  async create(data: { email: string; passwordHash: string}): Promise<User> {
    return this.repo.create(data);
  }

  async updateRefreshTokenHash(userId: string, hash: string | null) {
    // On logout, clear both hash and jti
    await this.repo.updateRefreshTokenHash(userId, hash);
  }

  async clearRefreshToken(userId: string) {
    await this.repo.updateRefreshTokenHash(userId, null);
  }

  // NEW: set both hash + jti on initial issue
  async updateRefreshState(userId: string, data: { refreshTokenHash: string; refreshJti: string }) {
    return this.repo.updateRefreshState(userId, data);
  }

  async getAllUsers(): Promise<User[]> {
    return this.repo.getAllUsers();
  }

  // NEW: atomic rotation to prevent concurrent refresh replay
  async rotateRefreshTokenAtomic(
    userId: string,
    currentHash: string,
    currentJti: string,
    nextHash: string,
    nextJti: string,
  ): Promise<boolean> {
    return this.repo.rotateRefreshTokenAtomic(userId, currentHash, currentJti, nextHash, nextJti);
  }
}