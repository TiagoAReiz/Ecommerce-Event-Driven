import { SubOrderStatus } from '../../entities/sub-order.entity';
import {
  ListFilter,
  OrderWithSubOrders,
  PaginatedResult,
  SubOrderWithItems,
} from '../repositories/order-repository.interface';
import { Order } from '../../entities/order.entity';
import { SubOrder } from '../../entities/sub-order.entity';

export const ORDER_SERVICE = Symbol('ORDER_SERVICE');

export interface IOrderService {
  /**
   * `POST /orders`. Lê o carrinho (cart-service), resnapshota preço/dados de cada variant
   * (catalog-service), cria Order+SubOrder(por seller)+OrderItem, limpa o carrinho e publica
   * `OrderCreated`. Replay: se `(userId, idempotencyKey)` já existe, retorna o mesmo resultado
   * sem repetir nenhum efeito colateral (sem re-chamar cart/catalog, sem limpar carrinho de
   * novo, sem publicar de novo).
   */
  checkout(
    userId: string,
    addressId: string,
    idempotencyKey: string,
    accessToken: string,
  ): Promise<OrderWithSubOrders>;

  listByUser(userId: string, filter: ListFilter): Promise<PaginatedResult<Order>>;

  getById(userId: string, orderId: string): Promise<OrderWithSubOrders>;

  /** `POST /orders/:id/cancel`. Bloqueado se algum subOrder já SHIPPED/DELIVERED. */
  cancel(userId: string, orderId: string, cancelReason: string): Promise<OrderWithSubOrders>;

  /** `GET /sub-orders` — dashboard do seller logado (resolvido via catalog `GET /sellers/me`). */
  listBySeller(
    accessToken: string,
    filter: ListFilter & { status?: SubOrderStatus },
  ): Promise<PaginatedResult<SubOrder>>;

  /** `GET /sub-orders/:id` — mesma ownership de seller de `listBySeller`. */
  getSubOrderById(accessToken: string, subOrderId: string): Promise<SubOrderWithItems>;
}
