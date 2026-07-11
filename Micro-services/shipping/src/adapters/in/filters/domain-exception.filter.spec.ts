import { ArgumentsHost } from '@nestjs/common';
import { DomainExceptionFilter } from './domain-exception.filter';
import { DomainException } from '../../../core/exceptions/domain.exception';
import { AddressNotFoundException } from '../../../core/exceptions/address-not-found.exception';
import { AddressAccessDeniedException } from '../../../core/exceptions/address-access-denied.exception';
import { ShipmentNotFoundException } from '../../../core/exceptions/shipment-not-found.exception';
import { SellerAddressForbiddenException } from '../../../core/exceptions/seller-address-forbidden.exception';
import { InvalidCepException } from '../../../core/exceptions/invalid-cep.exception';
import { CepNotFoundException } from '../../../core/exceptions/cep-not-found.exception';

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
    [new AddressNotFoundException(), 404],
    [new ShipmentNotFoundException(), 404],
    [new CepNotFoundException('00000000'), 404],
    [new AddressAccessDeniedException(), 403],
    [new SellerAddressForbiddenException(), 403],
    [new InvalidCepException('x'), 400],
    [new UnmappedException(), 500],
  ])('maps %s to HTTP %i', (exception, status) => {
    const { host, response } = mockHost();
    filter.catch(exception as DomainException, host);
    expect(response.status).toHaveBeenCalledWith(status);
  });
});
