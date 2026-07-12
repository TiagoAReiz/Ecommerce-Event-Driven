import { DomainException } from './domain.exception';

// SubOrder é "de seller": ownership é `SubOrder.sellerId === Seller.id do usuário logado`
// (resolvido via catalog GET /sellers/me), nunca `SubOrder.orderId -> Order.userId`.
export class SubOrderAccessDeniedException extends DomainException {
  constructor() {
    super('SubOrder does not belong to the current seller');
  }
}
