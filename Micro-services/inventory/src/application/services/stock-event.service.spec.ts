import { StockEventService } from './stock-event.service';

function buildService() {
  const reservationRepository = {
    reserveForOrder: jest.fn(),
    confirmForSubOrders: jest.fn(),
    releaseSubOrders: jest.fn(),
    findReservedSubOrderIdsByOrderId: jest.fn(),
    expireDueReservations: jest.fn(),
  } as any;
  const service = new StockEventService(reservationRepository);
  return { service, reservationRepository };
}

describe('StockEventService', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe('handleOrderCreated', () => {
    it('reserves per subOrder passing only variantId+quantity and a TTL-derived expiresAt', async () => {
      const { service, reservationRepository } = buildService();
      process.env.RESERVATION_TTL_MINUTES = '15';
      const before = Date.now();

      await service.handleOrderCreated('evt-1', {
        orderId: 'order-1',
        userId: 'user-1',
        addressId: 'addr-1',
        subOrders: [
          {
            subOrderId: 'sub-1',
            sellerId: 'seller-1',
            items: [
              {
                variantId: 'v-1',
                sku: 'SKU-1',
                quantity: 2,
                weightGrams: 100,
                heightCm: 1,
                widthCm: 1,
                lengthCm: 1,
              },
            ],
          },
        ],
      });

      expect(reservationRepository.reserveForOrder).toHaveBeenCalledTimes(1);
      const [eventId, eventType, order, expiresAt] =
        reservationRepository.reserveForOrder.mock.calls[0];
      expect(eventId).toBe('evt-1');
      expect(eventType).toBe('OrderCreated');
      expect(order).toEqual({
        orderId: 'order-1',
        subOrders: [{ subOrderId: 'sub-1', items: [{ variantId: 'v-1', quantity: 2 }] }],
      });
      const ttlMs = (expiresAt as Date).getTime() - before;
      expect(ttlMs).toBeGreaterThanOrEqual(15 * 60 * 1000 - 1000);
      expect(ttlMs).toBeLessThanOrEqual(15 * 60 * 1000 + 5000);
    });

    it('falls back to a 15min default TTL when RESERVATION_TTL_MINUTES is unset/invalid', async () => {
      const { service, reservationRepository } = buildService();
      delete process.env.RESERVATION_TTL_MINUTES;
      const before = Date.now();

      await service.handleOrderCreated('evt-1', {
        orderId: 'order-1',
        userId: 'user-1',
        addressId: 'addr-1',
        subOrders: [],
      });

      const expiresAt = reservationRepository.reserveForOrder.mock.calls[0][3] as Date;
      const ttlMs = expiresAt.getTime() - before;
      expect(ttlMs).toBeGreaterThanOrEqual(15 * 60 * 1000 - 1000);
      expect(ttlMs).toBeLessThanOrEqual(15 * 60 * 1000 + 5000);
    });
  });

  it('handleOrderCancelled releases the payload subOrderIds with reason ORDER_CANCELLED', async () => {
    const { service, reservationRepository } = buildService();

    await service.handleOrderCancelled('evt-2', {
      orderId: 'order-1',
      userId: 'user-1',
      subOrderIds: ['sub-1', 'sub-2'],
      cancelReason: 'x',
      initiatedBy: 'CUSTOMER',
    });

    expect(reservationRepository.releaseSubOrders).toHaveBeenCalledWith(
      'evt-2',
      'OrderCancelled',
      ['sub-1', 'sub-2'],
      'ORDER_CANCELLED',
    );
  });

  it('handlePaymentConfirmed confirms the baixa for the split subOrderIds', async () => {
    const { service, reservationRepository } = buildService();

    await service.handlePaymentConfirmed('evt-3', {
      paymentId: 'pay-1',
      orderId: 'order-1',
      userId: 'user-1',
      method: 'PIX',
      totalAmount: '100.00',
      splits: [
        { subOrderId: 'sub-1', sellerId: 's1', amount: '50.00', platformFeeAmount: '5.00' },
        { subOrderId: 'sub-2', sellerId: 's2', amount: '50.00', platformFeeAmount: '5.00' },
      ],
    });

    expect(reservationRepository.confirmForSubOrders).toHaveBeenCalledWith(
      'evt-3',
      'PaymentConfirmed',
      ['sub-1', 'sub-2'],
    );
  });

  it('handlePaymentFailed recovers subOrderIds from the outbox and releases with reason PAYMENT_FAILED', async () => {
    const { service, reservationRepository } = buildService();
    reservationRepository.findReservedSubOrderIdsByOrderId.mockResolvedValue(['sub-1']);

    await service.handlePaymentFailed('evt-4', {
      paymentId: 'pay-1',
      orderId: 'order-1',
      userId: 'user-1',
      method: 'PIX',
      reason: 'declined',
    });

    expect(reservationRepository.findReservedSubOrderIdsByOrderId).toHaveBeenCalledWith('order-1');
    expect(reservationRepository.releaseSubOrders).toHaveBeenCalledWith(
      'evt-4',
      'PaymentFailed',
      ['sub-1'],
      'PAYMENT_FAILED',
    );
  });
});
