import { DomainException } from './domain.exception';

export class DuplicateSkuException extends DomainException {
  constructor() {
    super('A variant with this SKU already exists');
  }
}
