import { ArgumentsHost } from '@nestjs/common';
import { DomainExceptionFilter } from './domain-exception.filter';
import { UserContactNotFoundException } from '../../../core/exceptions/user-contact-not-found.exception';
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

  it('maps UserContactNotFoundException to HTTP 404', () => {
    const { host, response } = mockHost();
    const exception = new UserContactNotFoundException('user-1');

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 404,
      message: exception.message,
      error: 'Not Found',
    });
  });

  it('falls back to 500 for an unmapped domain exception', () => {
    const { host, response } = mockHost();

    filter.catch(new UnmappedException(), host);

    expect(response.status).toHaveBeenCalledWith(500);
  });
});
