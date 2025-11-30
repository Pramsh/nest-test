import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AuthenticationModule } from './authentication.module';
import { Transport } from '@nestjs/microservices';
import { AllRpcExceptionFilter } from '@common/errors';

async function bootstrap() {
  const ms = await NestFactory.createMicroservice(AuthenticationModule, {
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: parseInt(process.env.AUTH_MS_PORT ?? '3000', 10),
    },
  });

  ms.useGlobalFilters(new AllRpcExceptionFilter());
  ms.useGlobalPipes(new ValidationPipe());
  
  await ms.listen();
  console.log(`[auth] TCP microservice listening on ${process.env.AUTH_MS_PORT ?? 3000}`);
}
bootstrap();