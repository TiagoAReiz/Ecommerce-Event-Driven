import { DomainException } from './domain.exception';

export class GoogleAuthenticationFailedException extends DomainException {
  constructor() {
    super('Google authentication failed');
  }
}
