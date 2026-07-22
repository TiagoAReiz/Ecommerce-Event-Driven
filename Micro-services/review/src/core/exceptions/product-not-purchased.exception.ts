import { DomainException } from './domain.exception';

export class ProductNotPurchasedException extends DomainException {
  constructor() {
    super('Customer has not purchased this product in the given order');
  }
}
