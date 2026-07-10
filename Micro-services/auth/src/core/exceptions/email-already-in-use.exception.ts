import { DomainException } from './domain.exception';

export class EmailAlreadyInUseException extends DomainException {
  constructor() {
    super('An account with this email already exists');
  }
}
