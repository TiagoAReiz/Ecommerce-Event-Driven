import { DomainException } from './domain.exception';

export class ForbiddenSellerActionException extends DomainException {
  constructor() {
    super('You do not own this resource');
  }
}
