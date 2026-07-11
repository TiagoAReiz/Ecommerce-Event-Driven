import { DomainException } from './domain.exception';

export class StockItemAlreadyExistsException extends DomainException {
  constructor() {
    super('Stock item already exists for this variant');
  }
}
