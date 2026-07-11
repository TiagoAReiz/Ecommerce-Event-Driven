import { DomainException } from './domain.exception';

export class InvalidCepException extends DomainException {
  constructor(cep: string) {
    super(`Invalid CEP: ${cep}`);
  }
}
