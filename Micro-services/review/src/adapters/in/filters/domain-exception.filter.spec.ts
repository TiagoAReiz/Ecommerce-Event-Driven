import { ArgumentsHost } from '@nestjs/common';
import { DomainExceptionFilter } from './domain-exception.filter';
import { ProductNotPurchasedException } from '../../../core/exceptions/product-not-purchased.exception';
import { OrderServiceUnavailableException } from '../../../core/exceptions/order-service-unavailable.exception';

function buildHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('DomainExceptionFilter', () => {
  it('maps ProductNotPurchasedException to 403', () => {
    const filter = new DomainExceptionFilter();
    const { host, status } = buildHost();

    filter.catch(new ProductNotPurchasedException(), host);

    expect(status).toHaveBeenCalledWith(403);
  });

  it('maps OrderServiceUnavailableException to 503', () => {
    const filter = new DomainExceptionFilter();
    const { host, status } = buildHost();

    filter.catch(new OrderServiceUnavailableException(), host);

    expect(status).toHaveBeenCalledWith(503);
  });
});
