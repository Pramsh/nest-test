import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateResult } from 'mongoose';
import { User, UserDocument } from './entities/user.entity';

@Injectable()
export class UserRepository {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async findByEmail(email: string) {
    return this.userModel.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  async findById(id: string) {
    return this.userModel.findById(id).exec();
  }

  async create(data: { email: string; passwordHash: string }) {
    const doc = new this.userModel({
      email: data.email.toLowerCase().trim(),
      passwordHash: data.passwordHash,
    });
    return doc.save();
  }

  // Also reset refreshJti when clearing the token (logout)
  async updateRefreshTokenHash(userId: string, hash: string | null) {
    await this.userModel
      .findByIdAndUpdate(
        userId,
        { refreshTokenHash: hash, refreshJti: hash ? undefined : null },
        { new: true, timestamps: true },
      )
      .exec();
  }

  // Set both hash + jti together
  async updateRefreshState(userId: string, data: { refreshTokenHash: string; refreshJti: string }) {
    return this.userModel.updateOne({ _id: userId }, { $set: data });
  }

  // Compare-and-set update to prevent race
  async rotateRefreshTokenAtomic(
    userId: string,
    currentHash: string,
    currentJti: string,
    nextHash: string,
    nextJti: string,
  ): Promise<boolean> {
    const res: UpdateResult = await this.userModel.updateOne(
      { _id: userId, refreshTokenHash: currentHash, refreshJti: currentJti },
      { $set: { refreshTokenHash: nextHash, refreshJti: nextJti } },
    );
    const modified =
      typeof (res as any).modifiedCount === 'number'
        ? (res as any).modifiedCount
        : (res as any).nModified;
    return modified === 1;
  }

  
  async getAllUsers(): Promise<User[]> {
    return this.userModel.find().exec();
  }
}