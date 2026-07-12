import { DomainException } from './domain.exception';

export class OrderAccessDeniedException extends DomainException {
  constructor() {
    super('Order does not belong to the current user');
  }
}
