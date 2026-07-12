import { DomainException } from './domain.exception';

export class SellerNotActiveException extends DomainException {
  constructor() {
    super('Seller account is not active');
  }
}
