import { ArgumentsHost } from '@nestjs/common';
import { DomainExceptionFilter } from './domain-exception.filter';
import { SellerNotFoundException } from '../../../core/exceptions/seller-not-found.exception';
import { SellerAlreadyOnboardedException } from '../../../core/exceptions/seller-already-onboarded.exception';
import { DuplicateSellerDocumentException } from '../../../core/exceptions/duplicate-seller-document.exception';
import { SellerNotActiveException } from '../../../core/exceptions/seller-not-active.exception';
import { CategoryNotFoundException } from '../../../core/exceptions/category-not-found.exception';
import { ProductNotFoundException } from '../../../core/exceptions/product-not-found.exception';
import { VariantNotFoundException } from '../../../core/exceptions/variant-not-found.exception';
import { DuplicateSkuException } from '../../../core/exceptions/duplicate-sku.exception';
import { ForbiddenSellerActionException } from '../../../core/exceptions/forbidden-seller-action.exception';
import { DomainException } from '../../../core/exceptions/domain.exception';

class UnmappedException extends DomainException {
  constructor() {
    super('unmapped');
  }
}

function mockHost() {
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();

  it.each([
    [new SellerNotFoundException(), 404, 'Not Found'],
    [new CategoryNotFoundException(), 404, 'Not Found'],
    [new ProductNotFoundException(), 404, 'Not Found'],
    [new VariantNotFoundException(), 404, 'Not Found'],
    [new SellerAlreadyOnboardedException(), 409, 'Conflict'],
    [new DuplicateSellerDocumentException(), 409, 'Conflict'],
    [new DuplicateSkuException(), 409, 'Conflict'],
    [new SellerNotActiveException(), 403, 'Forbidden'],
    [new ForbiddenSellerActionException(), 403, 'Forbidden'],
  ])('maps %p to HTTP %i', (exception, status, error) => {
    const { host, response } = mockHost();

    filter.catch(exception as DomainException, host);

    expect(response.status).toHaveBeenCalledWith(status);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: status,
      message: (exception as DomainException).message,
      error,
    });
  });

  it('falls back to 500 for an unmapped domain exception', () => {
    const { host, response } = mockHost();

    filter.catch(new UnmappedException(), host);

    expect(response.status).toHaveBeenCalledWith(500);
  });
});
