import { DomainException } from './domain.exception';

export class InvalidQuantityException extends DomainException {
  constructor() {
    super('Quantity must be a positive integer');
  }
}
