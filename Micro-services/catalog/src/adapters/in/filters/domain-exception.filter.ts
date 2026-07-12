import {
  ArgumentsHost,
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
import { SellerNotFoundException } from '../../../core/exceptions/seller-not-found.exception';
import { SellerAlreadyOnboardedException } from '../../../core/exceptions/seller-already-onboarded.exception';
import { DuplicateSellerDocumentException } from '../../../core/exceptions/duplicate-seller-document.exception';
import { SellerNotActiveException } from '../../../core/exceptions/seller-not-active.exception';
import { CategoryNotFoundException } from '../../../core/exceptions/category-not-found.exception';
import { ProductNotFoundException } from '../../../core/exceptions/product-not-found.exception';
import { VariantNotFoundException } from '../../../core/exceptions/variant-not-found.exception';
import { DuplicateSkuException } from '../../../core/exceptions/duplicate-sku.exception';
import { ForbiddenSellerActionException } from '../../../core/exceptions/forbidden-seller-action.exception';

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const httpException = this.toHttp(exception);
    response.status(httpException.getStatus()).json(httpException.getResponse());
  }

  private toHttp(exception: DomainException): HttpException {
    if (
      exception instanceof SellerNotFoundException ||
      exception instanceof CategoryNotFoundException ||
      exception instanceof ProductNotFoundException ||
      exception instanceof VariantNotFoundException
    ) {
      return new NotFoundException(exception.message);
    }
    if (
      exception instanceof SellerAlreadyOnboardedException ||
      exception instanceof DuplicateSellerDocumentException ||
      exception instanceof DuplicateSkuException
    ) {
      return new ConflictException(exception.message);
    }
    if (
      exception instanceof SellerNotActiveException ||
      exception instanceof ForbiddenSellerActionException
    ) {
      return new ForbiddenException(exception.message);
    }
    return new InternalServerErrorException();
  }
}
