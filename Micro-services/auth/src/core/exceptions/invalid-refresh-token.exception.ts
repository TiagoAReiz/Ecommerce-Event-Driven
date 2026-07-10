import { DomainException } from './domain.exception';

export class InvalidRefreshTokenException extends DomainException {
  constructor() {
    super('Invalid or expired refresh token');
  }
}
