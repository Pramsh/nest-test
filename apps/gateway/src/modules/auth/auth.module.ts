import { Module } from '@nestjs/common';
import { AuthGatewayController } from './auth.controller';
import { AuthGatewayService } from './auth.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { LoggerModule } from '@common/logger'
import { SendService } from '../../utils/rcp.send';

@Module({
    imports: [
        ClientsModule.register([
            {
                name: 'AUTH_SERVICE',
                transport: Transport.TCP,
                options: {
                    host: process.env.AUTH_MS_HOST ?? '127.0.0.1',
                    port: parseInt(process.env.AUTH_MS_PORT ?? '3000', 10),
                },
            },
        ]),
        LoggerModule.forRoot({
            serviceName: 'GatewayService',
        }),
    ],
    controllers: [AuthGatewayController],
    providers: [AuthGatewayService, SendService],
    exports: [],
})
export class AuthGatewayModule {}