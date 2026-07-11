import { DomainException } from './domain.exception';

export class EmptyCartException extends DomainException {
  constructor() {
    super('Cart is empty, nothing to checkout');
  }
}
