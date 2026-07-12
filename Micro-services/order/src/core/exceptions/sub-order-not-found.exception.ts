import { DomainException } from './domain.exception';

export class SubOrderNotFoundException extends DomainException {
  constructor() {
    super('SubOrder not found');
  }
}
