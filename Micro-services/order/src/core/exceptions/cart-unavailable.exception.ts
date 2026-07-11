import { DomainException } from './domain.exception';

export class CartUnavailableException extends DomainException {
  constructor() {
    super('Cart service is unavailable');
  }
}
