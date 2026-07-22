import { OrderService } from './order.service';
import { EmptyCartException } from '../../core/exceptions/empty-cart.exception';
import { VariantNotFoundException } from '../../core/exceptions/variant-not-found.exception';
import { OrderNotFoundException } from '../../core/exceptions/order-not-found.exception';
import { OrderAccessDeniedException } from '../../core/exceptions/order-access-denied.exception';
import { OrderCancellationBlockedException } from '../../core/exceptions/order-cancellation-blocked.exception';
import { SellerNotFoundException } from '../../core/exceptions/seller-not-found.exception';
import { SubOrderNotFoundException } from '../../core/exceptions/sub-order-not-found.exception';
import { SubOrderAccessDeniedException } from '../../core/exceptions/sub-order-access-denied.exception';
import { Order } from '../../core/entities/order.entity';
import { SubOrder } from '../../core/entities/sub-order.entity';
import { OrderItem } from '../../core/entities/order-item.entity';

function buildOrder(overrides: Partial<Order> = {}): Order {
  return new Order({
    id: 'order-1',
    userId: 'user-1',
    addressId: 'addr-1',
    status: 'PENDING',
    totalAmount: '100.00',
    idempotencyKey: 'idem-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function buildSubOrder(overrides: Partial<SubOrder> = {}): SubOrder {
  return new SubOrder({
    id: 'sub-1',
    orderId: 'order-1',
    sellerId: 'seller-1',
    status: 'PENDING',
    subtotalAmount: '100.00',
    shippingAmount: null,
    stockReservedAt: null,
    freightQuotedAt: null,
    cancelReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function buildService() {
  const orderRepository = {
    findByIdempotencyKey: jest.fn(),
    createOrder: jest.fn(),
    findById: jest.fn(),
    findManyByUser: jest.fn(),
    findSubOrderById: jest.fn(),
    findManyBySeller: jest.fn(),
    cancelOrder: jest.fn(),
    cancelOrderForEvent: jest.fn(),
  } as any;
  const cartClient = { getCart: jest.fn(), clearCart: jest.fn() } as any;
  const catalogClient = { getVariant: jest.fn(), getMySeller: jest.fn(), getProductVariantIds: jest.fn() } as any;
  const service = new OrderService(orderRepository, cartClient, catalogClient);
  return { service, orderRepository, cartClient, catalogClient };
}

describe('OrderService', () => {
  describe('checkout', () => {
    it('replays the existing Order when (userId, idempotencyKey) already resolved — no cart/catalog calls', async () => {
      const { service, orderRepository, cartClient, catalogClient } = buildService();
      const existing = { order: buildOrder(), subOrders: [] };
      orderRepository.findByIdempotencyKey.mockResolvedValue(existing);

      const result = await service.checkout('user-1', 'addr-1', 'idem-1', 'token-1');

      expect(result).toBe(existing);
      expect(cartClient.getCart).not.toHaveBeenCalled();
      expect(catalogClient.getVariant).not.toHaveBeenCalled();
      expect(orderRepository.createOrder).not.toHaveBeenCalled();
    });

    it('throws EmptyCartException when the cart has no items', async () => {
      const { service, orderRepository, cartClient } = buildService();
      orderRepository.findByIdempotencyKey.mockResolvedValue(null);
      cartClient.getCart.mockResolvedValue([]);

      await expect(service.checkout('user-1', 'addr-1', 'idem-1', 'token-1')).rejects.toThrow(EmptyCartException);
    });

    it('throws VariantNotFoundException when the catalog no longer has a cart variant', async () => {
      const { service, orderRepository, cartClient, catalogClient } = buildService();
      orderRepository.findByIdempotencyKey.mockResolvedValue(null);
      cartClient.getCart.mockResolvedValue([{ variantId: 'v-1', quantity: 2 }]);
      catalogClient.getVariant.mockResolvedValue(null);

      await expect(service.checkout('user-1', 'addr-1', 'idem-1', 'token-1')).rejects.toThrow(
        VariantNotFoundException,
      );
    });

    it('groups cart items by sellerId into SubOrders and computes exact money subtotals', async () => {
      const { service, orderRepository, cartClient, catalogClient } = buildService();
      orderRepository.findByIdempotencyKey.mockResolvedValue(null);
      cartClient.getCart.mockResolvedValue([
        { variantId: 'v-1', quantity: 3 },
        { variantId: 'v-2', quantity: 1 },
      ]);
      catalogClient.getVariant.mockImplementation(async (variantId: string) => {
        if (variantId === 'v-1') {
          return {
            variantId: 'v-1',
            sellerId: 'seller-A',
            title: 'Fone',
            sku: 'SKU-1',
            price: '19.90',
            weightGrams: 200,
            heightCm: 5,
            widthCm: 5,
            lengthCm: 5,
          };
        }
        return {
          variantId: 'v-2',
          sellerId: 'seller-B',
          title: 'Mouse',
          sku: 'SKU-2',
          price: '99.99',
          weightGrams: 150,
          heightCm: 3,
          widthCm: 6,
          lengthCm: 10,
        };
      });
      const createdAggregate = { order: buildOrder(), subOrders: [] };
      orderRepository.createOrder.mockResolvedValue({ order: createdAggregate, created: true });

      await service.checkout('user-1', 'addr-1', 'idem-1', 'token-1');

      expect(orderRepository.createOrder).toHaveBeenCalledTimes(1);
      const input = orderRepository.createOrder.mock.calls[0][0];
      expect(input.userId).toBe('user-1');
      expect(input.addressId).toBe('addr-1');
      expect(input.idempotencyKey).toBe('idem-1');
      // 19.90 * 3 = 59.70 (exact, no float drift), + 99.99 = 159.69
      expect(input.totalAmount).toBe('159.69');
      expect(input.subOrders).toHaveLength(2);
      const subOrderA = input.subOrders.find((so: any) => so.sellerId === 'seller-A');
      expect(subOrderA.subtotalAmount).toBe('59.70');
      expect(subOrderA.items[0]).toMatchObject({ variantId: 'v-1', sku: 'SKU-1', quantity: 3, weightGrams: 200 });
      // outboxPayload carries heightCm/widthCm/lengthCm even though they aren't persisted to OrderItem.
      expect(input.outboxPayload.subOrders.find((s: any) => s.sellerId === 'seller-A').items[0]).toMatchObject({
        heightCm: 5,
        widthCm: 5,
        lengthCm: 5,
      });
    });

    it('clears the cart best-effort after a fresh creation, and swallows a clearCart failure', async () => {
      const { service, orderRepository, cartClient, catalogClient } = buildService();
      orderRepository.findByIdempotencyKey.mockResolvedValue(null);
      cartClient.getCart.mockResolvedValue([{ variantId: 'v-1', quantity: 1 }]);
      catalogClient.getVariant.mockResolvedValue({
        variantId: 'v-1',
        sellerId: 'seller-A',
        title: 'Fone',
        sku: 'SKU-1',
        price: '10.00',
        weightGrams: 100,
        heightCm: 1,
        widthCm: 1,
        lengthCm: 1,
      });
      orderRepository.createOrder.mockResolvedValue({ order: { order: buildOrder(), subOrders: [] }, created: true });
      cartClient.clearCart.mockRejectedValue(new Error('cart-service down'));

      await expect(service.checkout('user-1', 'addr-1', 'idem-1', 'token-1')).resolves.toBeDefined();
      expect(cartClient.clearCart).toHaveBeenCalledWith('token-1');
    });

    it('does NOT clear the cart when createOrder resolves a concurrent duplicate (created: false)', async () => {
      const { service, orderRepository, cartClient, catalogClient } = buildService();
      orderRepository.findByIdempotencyKey.mockResolvedValue(null);
      cartClient.getCart.mockResolvedValue([{ variantId: 'v-1', quantity: 1 }]);
      catalogClient.getVariant.mockResolvedValue({
        variantId: 'v-1',
        sellerId: 'seller-A',
        title: 'Fone',
        sku: 'SKU-1',
        price: '10.00',
        weightGrams: 100,
        heightCm: 1,
        widthCm: 1,
        lengthCm: 1,
      });
      orderRepository.createOrder.mockResolvedValue({
        order: { order: buildOrder(), subOrders: [] },
        created: false,
      });

      await service.checkout('user-1', 'addr-1', 'idem-1', 'token-1');

      expect(cartClient.clearCart).not.toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('throws OrderNotFoundException when the order does not exist', async () => {
      const { service, orderRepository } = buildService();
      orderRepository.findById.mockResolvedValue(null);

      await expect(service.getById('user-1', 'order-1')).rejects.toThrow(OrderNotFoundException);
    });

    it('throws OrderAccessDeniedException when the order belongs to another user', async () => {
      const { service, orderRepository } = buildService();
      orderRepository.findById.mockResolvedValue({ order: buildOrder({ userId: 'someone-else' }), subOrders: [] });

      await expect(service.getById('user-1', 'order-1')).rejects.toThrow(OrderAccessDeniedException);
    });

    it('returns the order detail when owned by the caller', async () => {
      const { service, orderRepository } = buildService();
      const detail = { order: buildOrder({ userId: 'user-1' }), subOrders: [] };
      orderRepository.findById.mockResolvedValue(detail);

      await expect(service.getById('user-1', 'order-1')).resolves.toBe(detail);
    });
  });

  describe('cancel', () => {
    it('throws OrderCancellationBlockedException when the repository reports blocked', async () => {
      const { service, orderRepository } = buildService();
      orderRepository.findById.mockResolvedValue({ order: buildOrder({ userId: 'user-1' }), subOrders: [] });
      orderRepository.cancelOrder.mockResolvedValue({ cancelled: false, blocked: true, subOrderIds: [] });

      await expect(service.cancel('user-1', 'order-1', 'changed my mind')).rejects.toThrow(
        OrderCancellationBlockedException,
      );
    });

    it('throws OrderAccessDeniedException before attempting to cancel someone else\'s order', async () => {
      const { service, orderRepository } = buildService();
      orderRepository.findById.mockResolvedValue({ order: buildOrder({ userId: 'someone-else' }), subOrders: [] });

      await expect(service.cancel('user-1', 'order-1', 'x')).rejects.toThrow(OrderAccessDeniedException);
      expect(orderRepository.cancelOrder).not.toHaveBeenCalled();
    });

    it('returns the refreshed order on success', async () => {
      const { service, orderRepository } = buildService();
      const owned = { order: buildOrder({ userId: 'user-1' }), subOrders: [] };
      const refreshed = { order: buildOrder({ userId: 'user-1', status: 'CANCELLED' }), subOrders: [] };
      orderRepository.findById.mockResolvedValueOnce(owned).mockResolvedValueOnce(refreshed);
      orderRepository.cancelOrder.mockResolvedValue({ cancelled: true, blocked: false, subOrderIds: ['sub-1'] });

      const result = await service.cancel('user-1', 'order-1', 'changed my mind');

      expect(result).toBe(refreshed);
      expect(orderRepository.cancelOrder).toHaveBeenCalledWith('order-1', 'changed my mind', 'CUSTOMER');
    });
  });

  describe('listBySeller / getSubOrderById (seller ownership via catalog)', () => {
    it('listBySeller throws SellerNotFoundException when the caller has no seller profile', async () => {
      const { service, catalogClient } = buildService();
      catalogClient.getMySeller.mockResolvedValue(null);

      await expect(service.listBySeller('token-1', { limit: 20 })).rejects.toThrow(SellerNotFoundException);
    });

    it('listBySeller resolves seller.id via catalog and filters by it', async () => {
      const { service, orderRepository, catalogClient } = buildService();
      catalogClient.getMySeller.mockResolvedValue({ id: 'seller-42', status: 'ACTIVE' });
      orderRepository.findManyBySeller.mockResolvedValue({ items: [], nextCursor: null });

      await service.listBySeller('token-1', { limit: 20 });

      expect(orderRepository.findManyBySeller).toHaveBeenCalledWith('seller-42', { limit: 20 });
    });

    it('getSubOrderById throws SubOrderNotFoundException when the subOrder does not exist', async () => {
      const { service, orderRepository } = buildService();
      orderRepository.findSubOrderById.mockResolvedValue(null);

      await expect(service.getSubOrderById('token-1', 'sub-1')).rejects.toThrow(SubOrderNotFoundException);
    });

    it('getSubOrderById throws SubOrderAccessDeniedException when the caller is a different seller', async () => {
      const { service, orderRepository, catalogClient } = buildService();
      orderRepository.findSubOrderById.mockResolvedValue({
        subOrder: buildSubOrder({ sellerId: 'seller-owner' }),
        items: [] as OrderItem[],
      });
      catalogClient.getMySeller.mockResolvedValue({ id: 'seller-someone-else', status: 'ACTIVE' });

      await expect(service.getSubOrderById('token-1', 'sub-1')).rejects.toThrow(SubOrderAccessDeniedException);
    });

    it('getSubOrderById returns the subOrder when owned by the caller seller', async () => {
      const { service, orderRepository, catalogClient } = buildService();
      const found = { subOrder: buildSubOrder({ sellerId: 'seller-42' }), items: [] as OrderItem[] };
      orderRepository.findSubOrderById.mockResolvedValue(found);
      catalogClient.getMySeller.mockResolvedValue({ id: 'seller-42', status: 'ACTIVE' });

      await expect(service.getSubOrderById('token-1', 'sub-1')).resolves.toBe(found);
    });
  });

  describe('verifyPurchase', () => {
    it('throws OrderNotFoundException when the order does not exist', async () => {
      const { service, orderRepository } = buildService();
      orderRepository.findById.mockResolvedValue(null);

      await expect(service.verifyPurchase('user-1', 'order-1', 'prod-1', 'token-1')).rejects.toThrow(
        OrderNotFoundException,
      );
    });

    it('throws OrderAccessDeniedException when the order belongs to another user', async () => {
      const { service, orderRepository } = buildService();
      orderRepository.findById.mockResolvedValue({ order: buildOrder({ userId: 'someone-else' }), subOrders: [] });

      await expect(service.verifyPurchase('user-1', 'order-1', 'prod-1', 'token-1')).rejects.toThrow(
        OrderAccessDeniedException,
      );
    });

    it('is not eligible when the order is not COMPLETED yet', async () => {
      const { service, orderRepository, catalogClient } = buildService();
      orderRepository.findById.mockResolvedValue({
        order: buildOrder({ userId: 'user-1', status: 'PAID' }),
        subOrders: [{ subOrder: buildSubOrder({ sellerId: 'seller-1' }), items: [{ variantId: 'v-1' } as OrderItem] }],
      });

      const result = await service.verifyPurchase('user-1', 'order-1', 'prod-1', 'token-1');

      expect(result).toEqual({ eligible: false });
      expect(catalogClient.getProductVariantIds).not.toHaveBeenCalled();
    });

    it('is not eligible when the product does not exist in the catalog', async () => {
      const { service, orderRepository, catalogClient } = buildService();
      orderRepository.findById.mockResolvedValue({
        order: buildOrder({ userId: 'user-1', status: 'COMPLETED' }),
        subOrders: [{ subOrder: buildSubOrder({ sellerId: 'seller-1' }), items: [{ variantId: 'v-1' } as OrderItem] }],
      });
      catalogClient.getProductVariantIds.mockResolvedValue(null);

      const result = await service.verifyPurchase('user-1', 'order-1', 'prod-missing', 'token-1');

      expect(result).toEqual({ eligible: false });
    });

    it('is not eligible when none of the order items match the product variants', async () => {
      const { service, orderRepository, catalogClient } = buildService();
      orderRepository.findById.mockResolvedValue({
        order: buildOrder({ userId: 'user-1', status: 'COMPLETED' }),
        subOrders: [{ subOrder: buildSubOrder({ sellerId: 'seller-1' }), items: [{ variantId: 'v-1' } as OrderItem] }],
      });
      catalogClient.getProductVariantIds.mockResolvedValue(['v-other']);

      const result = await service.verifyPurchase('user-1', 'order-1', 'prod-1', 'token-1');

      expect(result).toEqual({ eligible: false });
    });

    it('is eligible and returns the sellerId when a sub-order item matches a product variant', async () => {
      const { service, orderRepository, catalogClient } = buildService();
      orderRepository.findById.mockResolvedValue({
        order: buildOrder({ userId: 'user-1', status: 'COMPLETED' }),
        subOrders: [
          { subOrder: buildSubOrder({ sellerId: 'seller-A' }), items: [{ variantId: 'v-1' } as OrderItem] },
          { subOrder: buildSubOrder({ sellerId: 'seller-B' }), items: [{ variantId: 'v-2' } as OrderItem] },
        ],
      });
      catalogClient.getProductVariantIds.mockResolvedValue(['v-2']);

      const result = await service.verifyPurchase('user-1', 'order-1', 'prod-1', 'token-1');

      expect(result).toEqual({ eligible: true, sellerId: 'seller-B' });
      expect(catalogClient.getProductVariantIds).toHaveBeenCalledWith('prod-1', 'token-1');
    });
  });
});
