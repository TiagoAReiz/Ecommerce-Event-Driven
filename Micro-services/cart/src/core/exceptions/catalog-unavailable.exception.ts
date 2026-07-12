import { DomainException } from './domain.exception';

export class CatalogUnavailableException extends DomainException {
  constructor() {
    super('Catalog service is unavailable');
  }
}
