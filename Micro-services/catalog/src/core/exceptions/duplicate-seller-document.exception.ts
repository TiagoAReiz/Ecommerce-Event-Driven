import { DomainException } from './domain.exception';

export class DuplicateSellerDocumentException extends DomainException {
  constructor() {
    super('A seller with this document already exists');
  }
}
