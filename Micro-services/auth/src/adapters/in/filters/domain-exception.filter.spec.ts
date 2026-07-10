import { ArgumentsHost } from '@nestjs/common';
import { DomainExceptionFilter } from './domain-exception.filter';
import { InvalidRefreshTokenException } from '../../../core/exceptions/invalid-refresh-token.exception';
import { GoogleAuthenticationFailedException } from '../../../core/exceptions/google-authentication-failed.exception';
import { EmailAlreadyInUseException } from '../../../core/exceptions/email-already-in-use.exception';
import { UserNotFoundException } from '../../../core/exceptions/user-not-found.exception';
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
    [new InvalidRefreshTokenException(), 401, 'Unauthorized'],
    [new GoogleAuthenticationFailedException(), 400, 'Bad Request'],
    [new EmailAlreadyInUseException(), 409, 'Conflict'],
    [new UserNotFoundException(), 404, 'Not Found'],
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
