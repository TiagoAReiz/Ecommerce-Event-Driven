import { DomainException } from './domain.exception';

export class PaymentNotFoundException extends DomainException {
  constructor() {
    super('Payment not found');
  }
}
