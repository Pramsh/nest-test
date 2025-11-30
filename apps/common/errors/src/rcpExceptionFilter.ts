import { Catch, ArgumentsHost, RpcExceptionFilter } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';

@Catch()
export class AllRpcExceptionFilter implements RpcExceptionFilter {
  catch(exception: any, _host: ArgumentsHost): Observable<any> {  
    // If it's a BadRequestException (validation error)
    console.log('Exception caught by AllRpcExceptionFilter:', exception);
    if (exception?.getStatus && exception.getStatus() === 400) {
      return throwError(() => new RpcException({
        statusCode: 400,
        error: 'Bad Request',
        message: exception.message || exception.response?.message,
      }));
    }
    // For other exceptions, wrap as RpcException
    return throwError(() => new RpcException(exception.error || exception.message || 'Internal server error'));
  }
}