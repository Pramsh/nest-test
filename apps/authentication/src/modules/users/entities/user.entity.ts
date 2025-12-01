import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
  collection: 'users',
})
export class User {
  // Do NOT define `id` with @Prop — Mongoose creates `_id` automatically.
  // We'll expose `id` via transform or a virtual (see below).

  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ type: String, required: true })
  passwordHash: string;

  @Prop({ type: String, default: null })
  refreshTokenHash: string | null;

  @Prop({ type: String, default: null })
  refreshJti: string | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly id: string;
}

export type UserDocument = User & Document;

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.virtual('id').get(function (this: any) {
  return this._id?.toString();
});

// Output cleanup
UserSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete (ret as any)._id;
    delete (ret as any).passwordHash;
    delete (ret as any).refreshTokenHash;
    delete (ret as any).refreshJti;
    return ret;
  },
});

UserSchema.set('toObject', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete (ret as any)._id;
    return ret;
  },
});