import { DomainException } from './domain.exception';

export class OrderNotFoundException extends DomainException {
  constructor() {
    super('Order not found');
  }
}
