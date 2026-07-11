import { DomainException } from './domain.exception';

export class VariantNotFoundException extends DomainException {
  constructor() {
    super('Product variant not found in catalog');
  }
}
