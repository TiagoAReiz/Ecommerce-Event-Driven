import { DomainException } from './domain.exception';

// Usuário logado não tem um Seller ACTIVE no catalog-service — não pode acessar o dashboard
// de subOrders (GET /sub-orders, GET /sub-orders/:id são rotas "de seller").
export class SellerNotFoundException extends DomainException {
  constructor() {
    super('Current user has no active seller profile');
  }
}
