import { DomainException } from './domain.exception';

export class ForbiddenStockActionException extends DomainException {
  constructor() {
    super('You do not own this stock resource');
  }
}
