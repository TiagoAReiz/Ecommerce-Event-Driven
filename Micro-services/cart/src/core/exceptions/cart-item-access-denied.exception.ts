import { DomainException } from './domain.exception';

export class CartItemAccessDeniedException extends DomainException {
  constructor() {
    super('Cart item does not belong to the authenticated user');
  }
}
