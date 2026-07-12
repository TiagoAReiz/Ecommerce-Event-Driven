import { DomainException } from './domain.exception';

export class ProductNotFoundException extends DomainException {
  constructor() {
    super('Product not found');
  }
}
