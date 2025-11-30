import { Module, Global, DynamicModule } from '@nestjs/common';
import { Logger } from './Logger';

export interface LoggerModuleOptions {
  serviceName?: string;
  disableDb?: boolean;
}

@Global()
@Module({})
export class LoggerModule {
  static forRoot(options: LoggerModuleOptions = {}): DynamicModule {
    const serviceName = 
      options.serviceName ||
      process.env.K_SERVICE ||
      process.env.SERVICE_NAME ||
      'app';

    return {
      module: LoggerModule,
      providers: [
        {
          provide: 'logger_module', 
          useValue: new Logger(serviceName, undefined, options.disableDb),
        },
      ],
      exports: ['logger_module'],
      global: true,
    };
  }
}