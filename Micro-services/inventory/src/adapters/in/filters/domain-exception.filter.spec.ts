import { ArgumentsHost } from '@nestjs/common';
import { DomainExceptionFilter } from './domain-exception.filter';
import { DomainException } from '../../../core/exceptions/domain.exception';
import { StockItemNotFoundException } from '../../../core/exceptions/stock-item-not-found.exception';
import { VariantNotFoundException } from '../../../core/exceptions/variant-not-found.exception';
import { StockItemAlreadyExistsException } from '../../../core/exceptions/stock-item-already-exists.exception';
import { ForbiddenStockActionException } from '../../../core/exceptions/forbidden-stock-action.exception';
import { SellerNotActiveException } from '../../../core/exceptions/seller-not-active.exception';
import { InvalidStockQuantityException } from '../../../core/exceptions/invalid-stock-quantity.exception';
import { CatalogUnavailableException } from '../../../core/exceptions/catalog-unavailable.exception';

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
    [new StockItemNotFoundException(), 404, 'Not Found'],
    [new VariantNotFoundException(), 404, 'Not Found'],
    [new StockItemAlreadyExistsException(), 409, 'Conflict'],
    [new ForbiddenStockActionException(), 403, 'Forbidden'],
    [new SellerNotActiveException(), 403, 'Forbidden'],
    [new InvalidStockQuantityException(), 400, 'Bad Request'],
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
