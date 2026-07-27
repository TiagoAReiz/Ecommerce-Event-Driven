import { DomainException } from './domain.exception';

export class CepServiceUnavailableException extends DomainException {
  constructor() {
    super('CEP lookup service is unavailable');
  }
}
