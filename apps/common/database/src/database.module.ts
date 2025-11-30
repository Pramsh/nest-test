import { Module, Global, DynamicModule } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DATABASE_CONNECTION } from './database.constants';

export interface DatabaseModuleOptions {
  uri?: string;
  dbName?: string;
  allowedCollections?: string[]; // Just store this info
}

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseModuleOptions = {}): DynamicModule {
    const uri =
      options.uri ||
      process.env.MONGODB_URI ||
      'mongodb://localhost:27017';
    const dbName =
      options.dbName ||
      process.env.MONGODB_DB_NAME ||
      'app_dev';

    return {
      module: DatabaseModule,
      imports: [
        MongooseModule.forRoot(uri, {
          dbName,
        }),
      ],
      providers: [
        {
          provide: DATABASE_CONNECTION,
          useValue: { uri, dbName, allowedCollections: options.allowedCollections },
        },
      ],
      exports: [MongooseModule, DATABASE_CONNECTION],
      global: true,
    };
  }
}