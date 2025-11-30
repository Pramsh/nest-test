import { HttpException, Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import { coerceRpcError } from "./rcp.error";
import { firstValueFrom, timeout, TimeoutError as RxTimeoutError } from 'rxjs';
import { ClientProxy } from "@nestjs/microservices";
import { Logger } from "@common/logger";
    
@Injectable()
export class SendService {
    constructor(
        @Inject('logger_module') private readonly logger: Logger,
        @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    ) {}

    async send<Req, Res>(pattern: string, data: Req): Promise<Res> {
        try {
          // Opzionale: imposta un timeout esplicito per evitare chiamate appese
          const obs$ = this.authClient.send<Res, Req>(pattern, data).pipe(timeout(10000));
          return await firstValueFrom(obs$);
        } catch (e: any) {
          e = e?.error && typeof e?.error !== "string" ? e.error : e;
          if (e instanceof RxTimeoutError) {
            // 504 Gateway Timeout leggibile
            this.logger.error("Timeout for " + pattern)
            throw new HttpException({ statusCode: 504, message: 'Upstream timeout', error: 'Gateway Timeout' }, 504);
          }
    
          const { status, message, error } = coerceRpcError(e);
    
          if (status === 500) {
            // Mantieni il 500 come InternalServerErrorException per coerenza con Nest
            this.logger.error("Internal Server Error for: " + pattern + " -- err: " + message)
    
            throw new InternalServerErrorException(message);
          }
          this.logger.error("Error -- status: "+ status +" for: " + pattern + " -- err: " + message)
          // Preserva lo shape completo nel body HTTP
          throw new HttpException({ statusCode: status, message, error }, status);
        }
      }
}