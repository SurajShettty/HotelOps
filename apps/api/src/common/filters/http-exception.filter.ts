import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse();

    const isStructured = typeof body === 'object' && body !== null;
    const code = isStructured && 'code' in body ? (body as { code: string }).code : HttpStatus[status] ?? 'ERROR';
    const message = isStructured && 'message' in body ? (body as { message: string | string[] }).message : exception.message;

    response.status(status).json({ data: null, error: { code, message } });
  }
}
