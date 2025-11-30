import { NestFactory } from '@nestjs/core';
import { GatewayModule } from './gateway.module';

async function bootstrap() {
  const app = await NestFactory.create(GatewayModule);
  const httpPort = parseInt(process.env.GATEWAY_HTTP_PORT ?? '4000', 10);
  await app.listen(httpPort, '0.0.0.0');
  console.log(`[gateway] HTTP server at http://localhost:${httpPort}`);
}
bootstrap();