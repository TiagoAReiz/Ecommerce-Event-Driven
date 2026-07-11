import { DomainException } from './domain.exception';

export class CepNotFoundException extends DomainException {
  constructor(cep: string) {
    super(`CEP not found: ${cep}`);
  }
}
