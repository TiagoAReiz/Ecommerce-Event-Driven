import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainException } from '../../../core/exceptions/domain.exception';
import { ProductNotPurchasedException } from '../../../core/exceptions/product-not-purchased.exception';
import { OrderServiceUnavailableException } from '../../../core/exceptions/order-service-unavailable.exception';

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const httpException = this.toHttp(exception);
    response.status(httpException.getStatus()).json(httpException.getResponse());
  }

  private toHttp(exception: DomainException): HttpException {
    if (exception instanceof ProductNotPurchasedException) {
      return new ForbiddenException(exception.message);
    }
    if (exception instanceof OrderServiceUnavailableException) {
      return new ServiceUnavailableException(exception.message);
    }
    return new InternalServerErrorException();
  }
}
