import { Module } from "@nestjs/common";
import { UserGatewayController } from "./user.controller";
import { UserGatewayService } from "./user.service";
import { SendService } from "../../utils/rcp.send";
import { ClientsModule, Transport } from "@nestjs/microservices";

@Module({
    controllers: [UserGatewayController],
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
    ],
    providers: [UserGatewayService, SendService],
})
export class UserGatewayModule {}