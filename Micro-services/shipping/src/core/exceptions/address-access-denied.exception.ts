import { DomainException } from './domain.exception';

export class AddressAccessDeniedException extends DomainException {
  constructor() {
    super('You do not own this address');
  }
}
