import { DomainException } from './domain.exception';

export class StockItemNotFoundException extends DomainException {
  constructor() {
    super('Stock item not found');
  }
}
