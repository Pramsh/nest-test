import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true, // automatically manages createdAt / updatedAt
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

  // Type-only (no @Prop): these exist because of timestamps & transform
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly id: string;
}

// Mongoose document type
export type UserDocument = User & Document;

export const UserSchema = SchemaFactory.createForClass(User);

// If you prefer an explicit virtual instead of transform mapping:
UserSchema.virtual('id').get(function (this: any) {
  return this._id?.toString();
});

// Output cleanup
UserSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    // virtual 'id' already added; just hide internal / sensitive fields
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