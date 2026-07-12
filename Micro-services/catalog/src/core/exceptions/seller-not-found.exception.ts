import { DomainException } from './domain.exception';

export class SellerNotFoundException extends DomainException {
  constructor() {
    super('Seller not found');
  }
}
