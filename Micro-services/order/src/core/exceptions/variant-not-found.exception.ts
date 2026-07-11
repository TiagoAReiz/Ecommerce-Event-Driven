import { DomainException } from './domain.exception';

export class VariantNotFoundException extends DomainException {
  constructor(variantId: string) {
    super(`Variant ${variantId} not found in catalog`);
  }
}
