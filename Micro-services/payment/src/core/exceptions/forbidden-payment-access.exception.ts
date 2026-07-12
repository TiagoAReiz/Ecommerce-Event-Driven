import { DomainException } from './domain.exception';

export class ForbiddenPaymentAccessException extends DomainException {
  constructor() {
    super('You do not own this payment');
  }
}
