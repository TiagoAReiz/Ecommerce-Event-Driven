import {
  ArgumentsHost,
  BadGatewayException,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainException } from '../../../core/exceptions/domain.exception';
import { OrderNotFoundException } from '../../../core/exceptions/order-not-found.exception';
import { OrderAccessDeniedException } from '../../../core/exceptions/order-access-denied.exception';
import { SubOrderNotFoundException } from '../../../core/exceptions/sub-order-not-found.exception';
import { SubOrderAccessDeniedException } from '../../../core/exceptions/sub-order-access-denied.exception';
import { EmptyCartException } from '../../../core/exceptions/empty-cart.exception';
import { VariantNotFoundException } from '../../../core/exceptions/variant-not-found.exception';
import { CatalogUnavailableException } from '../../../core/exceptions/catalog-unavailable.exception';
import { CartUnavailableException } from '../../../core/exceptions/cart-unavailable.exception';
import { OrderCancellationBlockedException } from '../../../core/exceptions/order-cancellation-blocked.exception';
import { SellerNotFoundException } from '../../../core/exceptions/seller-not-found.exception';

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const httpException = this.toHttp(exception);
    response.status(httpException.getStatus()).json(httpException.getResponse());
  }

  private toHttp(exception: DomainException): HttpException {
    if (
      exception instanceof OrderNotFoundException ||
      exception instanceof SubOrderNotFoundException ||
      exception instanceof VariantNotFoundException ||
      exception instanceof SellerNotFoundException
    ) {
      return new NotFoundException(exception.message);
    }
    if (
      exception instanceof OrderAccessDeniedException ||
      exception instanceof SubOrderAccessDeniedException
    ) {
      return new ForbiddenException(exception.message);
    }
    if (exception instanceof EmptyCartException) {
      return new BadRequestException(exception.message);
    }
    if (exception instanceof OrderCancellationBlockedException) {
      return new ConflictException(exception.message);
    }
    if (exception instanceof CatalogUnavailableException || exception instanceof CartUnavailableException) {
      return new BadGatewayException(exception.message);
    }
    return new InternalServerErrorException();
  }
}
