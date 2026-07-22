import { DomainException } from './domain.exception';

export class OrderServiceUnavailableException extends DomainException {
  constructor() {
    super('Order service is unavailable');
  }
}
