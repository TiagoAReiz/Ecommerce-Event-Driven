import { DomainException } from './domain.exception';

export class CartItemNotFoundException extends DomainException {
  constructor() {
    super('Cart item not found');
  }
}
