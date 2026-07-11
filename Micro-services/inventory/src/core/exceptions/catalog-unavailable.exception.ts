import { DomainException } from './domain.exception';

// A resolução de ownership de seller depende de uma chamada síncrona ao catalog-service
// (GET /sellers/me, GET /variants/:id). Se o catalog está fora do ar, mapeamos para 502.
export class CatalogUnavailableException extends DomainException {
  constructor() {
    super('Catalog service is unavailable');
  }
}
