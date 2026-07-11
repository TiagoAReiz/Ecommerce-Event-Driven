import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainException } from '../../../core/exceptions/domain.exception';
import { UserContactNotFoundException } from '../../../core/exceptions/user-contact-not-found.exception';

// Este serviço não tem endpoint de escrita, então nenhuma rota HTTP hoje lança exceção de
// domínio na prática (UserContactNotFoundException só ocorre no fluxo de consumo Kafka, fora do
// contexto HTTP, e é deixada propagar pro Kafka reentregar — este filter nunca a intercepta ali).
// Registrado mesmo assim por consistência com a convenção hexagonal do projeto e como rede de
// segurança caso um endpoint futuro passe a lançar exceções de domínio.
@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const httpException = this.toHttp(exception);
    response.status(httpException.getStatus()).json(httpException.getResponse());
  }

  private toHttp(exception: DomainException): HttpException {
    if (exception instanceof UserContactNotFoundException) {
      return new NotFoundException(exception.message);
    }
    return new InternalServerErrorException();
  }
}
