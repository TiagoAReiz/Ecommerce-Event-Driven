import { DomainException } from './domain.exception';

export class AddressNotFoundException extends DomainException {
  constructor() {
    super('Address not found');
  }
}
