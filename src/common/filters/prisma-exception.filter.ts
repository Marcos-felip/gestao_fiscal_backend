import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status: number;
    let message: string;

    switch (exception.code) {
      case 'P2002': {
        status = HttpStatus.CONFLICT;
        const fields = (exception.meta?.target as string[]) || [];
        message = `Violação de unicidade no(s) campo(s): ${fields.join(', ')}`;
        break;
      }
      case 'P2025':
        status = HttpStatus.NOT_FOUND;
        message = 'Registro não encontrado';
        break;
      case 'P2003':
        status = HttpStatus.BAD_REQUEST;
        message = 'Violação de chave estrangeira';
        break;
      case 'P2014':
        status = HttpStatus.BAD_REQUEST;
        message = 'Violação de relação obrigatória';
        break;
      default:
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        message = 'Erro inesperado no banco de dados';
    }

    response.status(status).json({
      statusCode: status,
      message,
      error: exception.code,
    });
  }
}
