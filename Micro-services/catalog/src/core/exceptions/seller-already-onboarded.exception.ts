import { DomainException } from './domain.exception';

export class SellerAlreadyOnboardedException extends DomainException {
  constructor() {
    super('This user already has a seller account');
  }
}
