import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ORDER_REPOSITORY } from '../../core/interfaces/repositories/order-repository.interface';
import type {
  IOrderRepository,
  ListFilter,
  OrderWithSubOrders,
  PaginatedResult,
  SubOrderWithItems,
} from '../../core/interfaces/repositories/order-repository.interface';
import type { CreateSubOrderInput } from '../../core/interfaces/repositories/inputs/order-repository.inputs';
import { CART_CLIENT } from '../../core/interfaces/external/cart-client.interface';
import type { ICartClient } from '../../core/interfaces/external/cart-client.interface';
import { CATALOG_CLIENT } from '../../core/interfaces/external/catalog-client.interface';
import type { CatalogVariant, ICatalogClient } from '../../core/interfaces/external/catalog-client.interface';
import type { IOrderService } from '../../core/interfaces/services/order-service.interface';
import { EmptyCartException } from '../../core/exceptions/empty-cart.exception';
import { VariantNotFoundException } from '../../core/exceptions/variant-not-found.exception';
import { OrderNotFoundException } from '../../core/exceptions/order-not-found.exception';
import { OrderAccessDeniedException } from '../../core/exceptions/order-access-denied.exception';
import { OrderCancellationBlockedException } from '../../core/exceptions/order-cancellation-blocked.exception';
import { SellerNotFoundException } from '../../core/exceptions/seller-not-found.exception';
import { SubOrderNotFoundException } from '../../core/exceptions/sub-order-not-found.exception';
import { SubOrderAccessDeniedException } from '../../core/exceptions/sub-order-access-denied.exception';
import { Order } from '../../core/entities/order.entity';
import { SubOrder, SubOrderStatus } from '../../core/entities/sub-order.entity';

const DEFAULT_CANCEL_REASON = 'Cancelled by customer';

@Injectable()
export class OrderService implements IOrderService {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepository: IOrderRepository,
    @Inject(CART_CLIENT) private readonly cartClient: ICartClient,
    @Inject(CATALOG_CLIENT) private readonly catalogClient: ICatalogClient,
  ) {}

  async checkout(
    userId: string,
    addressId: string,
    idempotencyKey: string,
    accessToken: string,
  ): Promise<OrderWithSubOrders> {
    // Replay: se essa (userId, idempotencyKey) já virou Order, retorna sem repetir NENHUM
    // efeito colateral (sem re-chamar cart/catalog, sem limpar carrinho de novo, sem publicar).
    const existing = await this.orderRepository.findByIdempotencyKey(userId, idempotencyKey);
    if (existing) return existing;

    const cartItems = await this.cartClient.getCart(accessToken);
    if (cartItems.length === 0) throw new EmptyCartException();

    // Resnapshota TODA variant do catalog-service — nunca confia no snapshot do cart (que não
    // tem sku/título/peso/dimensões e pode ter preço desatualizado).
    const variantsByVariantId = new Map<string, CatalogVariant>();
    for (const item of cartItems) {
      const variant = await this.catalogClient.getVariant(item.variantId, accessToken);
      if (!variant) throw new VariantNotFoundException(item.variantId);
      variantsByVariantId.set(item.variantId, variant);
    }

    const bySeller = new Map<string, { variant: CatalogVariant; quantity: number }[]>();
    for (const item of cartItems) {
      const variant = variantsByVariantId.get(item.variantId)!;
      const list = bySeller.get(variant.sellerId) ?? [];
      list.push({ variant, quantity: item.quantity });
      bySeller.set(variant.sellerId, list);
    }

    const orderId = randomUUID();
    const repoSubOrders: CreateSubOrderInput[] = [];
    const eventSubOrders: {
      subOrderId: string;
      sellerId: string;
      items: {
        variantId: string;
        sku: string;
        quantity: number;
        weightGrams: number;
        heightCm: number;
        widthCm: number;
        lengthCm: number;
      }[];
    }[] = [];
    let orderTotal = new Prisma.Decimal(0);

    for (const [sellerId, entries] of bySeller) {
      const subOrderId = randomUUID();
      let subtotal = new Prisma.Decimal(0);

      for (const { variant, quantity } of entries) {
        subtotal = subtotal.plus(new Prisma.Decimal(variant.price).times(quantity));
      }
      orderTotal = orderTotal.plus(subtotal);

      repoSubOrders.push({
        id: subOrderId,
        sellerId,
        subtotalAmount: subtotal.toFixed(2),
        items: entries.map(({ variant, quantity }) => ({
          variantId: variant.variantId,
          sku: variant.sku,
          title: variant.title,
          unitPrice: new Prisma.Decimal(variant.price).toFixed(2),
          quantity,
          weightGrams: variant.weightGrams,
        })),
      });

      eventSubOrders.push({
        subOrderId,
        sellerId,
        items: entries.map(({ variant, quantity }) => ({
          variantId: variant.variantId,
          sku: variant.sku,
          quantity,
          weightGrams: variant.weightGrams,
          heightCm: variant.heightCm,
          widthCm: variant.widthCm,
          lengthCm: variant.lengthCm,
        })),
      });
    }

    const { order, created } = await this.orderRepository.createOrder({
      id: orderId,
      userId,
      addressId,
      idempotencyKey,
      totalAmount: orderTotal.toFixed(2),
      subOrders: repoSubOrders,
      outboxPayload: { orderId, userId, addressId, subOrders: eventSubOrders },
    });

    if (created) {
      // Best-effort: uma falha ao limpar o carrinho NÃO deve reverter o Order já commitado.
      try {
        await this.cartClient.clearCart(accessToken);
      } catch {
        // Silenciosamente ignorado — o carrinho fica com itens já pedidos, mas o checkout
        // em si foi bem-sucedido. Um retry do cliente (mesma idempotencyKey) cai no replay
        // acima e não tenta limpar de novo.
      }
    }

    return order;
  }

  async listByUser(userId: string, filter: ListFilter): Promise<PaginatedResult<Order>> {
    return this.orderRepository.findManyByUser(userId, filter);
  }

  async getById(userId: string, orderId: string): Promise<OrderWithSubOrders> {
    const found = await this.orderRepository.findById(orderId);
    if (!found) throw new OrderNotFoundException();
    if (found.order.userId !== userId) throw new OrderAccessDeniedException();
    return found;
  }

  async cancel(userId: string, orderId: string, cancelReason: string): Promise<OrderWithSubOrders> {
    const found = await this.orderRepository.findById(orderId);
    if (!found) throw new OrderNotFoundException();
    if (found.order.userId !== userId) throw new OrderAccessDeniedException();

    const result = await this.orderRepository.cancelOrder(
      orderId,
      cancelReason || DEFAULT_CANCEL_REASON,
      'CUSTOMER',
    );
    if (result.blocked) throw new OrderCancellationBlockedException();

    const refreshed = await this.orderRepository.findById(orderId);
    if (!refreshed) throw new OrderNotFoundException();
    return refreshed;
  }

  async listBySeller(
    accessToken: string,
    filter: ListFilter & { status?: SubOrderStatus },
  ): Promise<PaginatedResult<SubOrder>> {
    const seller = await this.catalogClient.getMySeller(accessToken);
    if (!seller) throw new SellerNotFoundException();
    return this.orderRepository.findManyBySeller(seller.id, filter);
  }

  async getSubOrderById(accessToken: string, subOrderId: string): Promise<SubOrderWithItems> {
    const found = await this.orderRepository.findSubOrderById(subOrderId);
    if (!found) throw new SubOrderNotFoundException();

    const seller = await this.catalogClient.getMySeller(accessToken);
    if (!seller || found.subOrder.sellerId !== seller.id) throw new SubOrderAccessDeniedException();

    return found;
  }
}
