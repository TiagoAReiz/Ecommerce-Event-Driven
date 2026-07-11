import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainException } from '../../../core/exceptions/domain.exception';
import { PaymentNotFoundException } from '../../../core/exceptions/payment-not-found.exception';
import { ForbiddenPaymentAccessException } from '../../../core/exceptions/forbidden-payment-access.exception';
import { InvalidWebhookSignatureException } from '../../../core/exceptions/invalid-webhook-signature.exception';

// Traduz exceções de domínio pra HTTP. Exceções de consumo (ex.: SellerPaymentProfileNotFound) NÃO
// passam por aqui — elas propagam no handler do Kafka pra forçar retry, não viram resposta HTTP.
@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const httpException = this.toHttp(exception);
    response.status(httpException.getStatus()).json(httpException.getResponse());
  }

  private toHttp(exception: DomainException): HttpException {
    if (exception instanceof PaymentNotFoundException) {
      return new NotFoundException(exception.message);
    }
    if (exception instanceof ForbiddenPaymentAccessException) {
      return new ForbiddenException(exception.message);
    }
    if (exception instanceof InvalidWebhookSignatureException) {
      return new UnauthorizedException(exception.message);
    }
    return new InternalServerErrorException();
  }
}
