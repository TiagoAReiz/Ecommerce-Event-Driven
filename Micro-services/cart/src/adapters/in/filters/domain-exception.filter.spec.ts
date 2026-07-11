import { ArgumentsHost } from '@nestjs/common';
import { DomainExceptionFilter } from './domain-exception.filter';
import { CartItemNotFoundException } from '../../../core/exceptions/cart-item-not-found.exception';
import { CartItemAccessDeniedException } from '../../../core/exceptions/cart-item-access-denied.exception';
import { InvalidQuantityException } from '../../../core/exceptions/invalid-quantity.exception';
import { VariantNotFoundException } from '../../../core/exceptions/variant-not-found.exception';
import { CatalogUnavailableException } from '../../../core/exceptions/catalog-unavailable.exception';
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
    [new CartItemNotFoundException(), 404, 'Not Found'],
    [new CartItemAccessDeniedException(), 403, 'Forbidden'],
    [new InvalidQuantityException(), 400, 'Bad Request'],
    [new VariantNotFoundException(), 404, 'Not Found'],
    [new CatalogUnavailableException(), 502, 'Bad Gateway'],
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
