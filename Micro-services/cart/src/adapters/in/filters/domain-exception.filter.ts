import {
  ArgumentsHost,
  BadGatewayException,
  BadRequestException,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainException } from '../../../core/exceptions/domain.exception';
import { CartItemNotFoundException } from '../../../core/exceptions/cart-item-not-found.exception';
import { CartItemAccessDeniedException } from '../../../core/exceptions/cart-item-access-denied.exception';
import { InvalidQuantityException } from '../../../core/exceptions/invalid-quantity.exception';
import { VariantNotFoundException } from '../../../core/exceptions/variant-not-found.exception';
import { CatalogUnavailableException } from '../../../core/exceptions/catalog-unavailable.exception';

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const httpException = this.toHttp(exception);
    response.status(httpException.getStatus()).json(httpException.getResponse());
  }

  private toHttp(exception: DomainException): HttpException {
    if (exception instanceof CartItemNotFoundException) {
      return new NotFoundException(exception.message);
    }
    if (exception instanceof CartItemAccessDeniedException) {
      return new ForbiddenException(exception.message);
    }
    if (exception instanceof InvalidQuantityException) {
      return new BadRequestException(exception.message);
    }
    if (exception instanceof VariantNotFoundException) {
      return new NotFoundException(exception.message);
    }
    if (exception instanceof CatalogUnavailableException) {
      return new BadGatewayException(exception.message);
    }
    return new InternalServerErrorException();
  }
}
