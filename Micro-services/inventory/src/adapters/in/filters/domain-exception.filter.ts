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
import { StockItemNotFoundException } from '../../../core/exceptions/stock-item-not-found.exception';
import { VariantNotFoundException } from '../../../core/exceptions/variant-not-found.exception';
import { StockItemAlreadyExistsException } from '../../../core/exceptions/stock-item-already-exists.exception';
import { ForbiddenStockActionException } from '../../../core/exceptions/forbidden-stock-action.exception';
import { SellerNotActiveException } from '../../../core/exceptions/seller-not-active.exception';
import { InvalidStockQuantityException } from '../../../core/exceptions/invalid-stock-quantity.exception';
import { CatalogUnavailableException } from '../../../core/exceptions/catalog-unavailable.exception';

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const httpException = this.toHttp(exception);
    response.status(httpException.getStatus()).json(httpException.getResponse());
  }

  private toHttp(exception: DomainException): HttpException {
    if (
      exception instanceof StockItemNotFoundException ||
      exception instanceof VariantNotFoundException
    ) {
      return new NotFoundException(exception.message);
    }
    if (exception instanceof StockItemAlreadyExistsException) {
      return new ConflictException(exception.message);
    }
    if (
      exception instanceof ForbiddenStockActionException ||
      exception instanceof SellerNotActiveException
    ) {
      return new ForbiddenException(exception.message);
    }
    if (exception instanceof InvalidStockQuantityException) {
      return new BadRequestException(exception.message);
    }
    if (exception instanceof CatalogUnavailableException) {
      return new BadGatewayException(exception.message);
    }
    return new InternalServerErrorException();
  }
}
