import { DomainException } from './domain.exception';

// Lançada quando o usuário logado não tem um Seller ACTIVE no catalog-service — logo
// não pode inicializar/repor estoque. Mapeada para 403.
export class SellerNotActiveException extends DomainException {
  constructor() {
    super('You must be an active seller to manage stock');
  }
}
