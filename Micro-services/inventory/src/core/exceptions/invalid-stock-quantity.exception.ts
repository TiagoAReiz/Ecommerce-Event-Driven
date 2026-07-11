import { DomainException } from './domain.exception';

export class InvalidStockQuantityException extends DomainException {
  constructor(message = 'Invalid stock quantity') {
    super(message);
  }
}
