import { OrderEventService } from './order-event.service';

function buildService() {
  const orderRepository = {
    recordStockReserved: jest.fn(),
    recordStockReservationFailed: jest.fn(),
    recordStockReleased: jest.fn(),
    recordFreightQuoted: jest.fn(),
    recordFreightQuoteFailed: jest.fn(),
    recordShipmentDispatched: jest.fn(),
    recordShipmentDelivered: jest.fn(),
    recordPaymentConfirmed: jest.fn(),
    recordPaymentFailed: jest.fn(),
    recordPaymentRefunded: jest.fn(),
  } as any;
  const service = new OrderEventService(orderRepository);
  return { service, orderRepository };
}

describe('OrderEventService', () => {
  it('handleStockReserved delegates with subOrderId/orderId from the payload', async () => {
    const { service, orderRepository } = buildService();

    await service.handleStockReserved('evt-1', {
      subOrderId: 'sub-1',
      orderId: 'order-1',
      reservations: [{ variantId: 'v-1', quantity: 2, reservationId: 'r-1' }],
    });

    expect(orderRepository.recordStockReserved).toHaveBeenCalledWith('evt-1', 'StockReserved', 'sub-1', 'order-1');
  });

  it('handleStockReservationFailed joins failedItems into a human-readable reason', async () => {
    const { service, orderRepository } = buildService();

    await service.handleStockReservationFailed('evt-2', {
      subOrderId: 'sub-1',
      orderId: 'order-1',
      failedItems: [{ variantId: 'v-1', requestedQty: 5, availableQty: 2 }],
    });

    expect(orderRepository.recordStockReservationFailed).toHaveBeenCalledWith(
      'evt-2',
      'StockReservationFailed',
      'sub-1',
      'order-1',
      expect.stringContaining('v-1'),
    );
  });

  it('handleStockReleased forwards the reason verbatim', async () => {
    const { service, orderRepository } = buildService();

    await service.handleStockReleased('evt-3', {
      subOrderId: 'sub-1',
      releasedItems: [{ variantId: 'v-1', quantity: 2 }],
      reason: 'EXPIRED',
    });

    expect(orderRepository.recordStockReleased).toHaveBeenCalledWith('evt-3', 'StockReleased', 'sub-1', 'EXPIRED');
  });

  it('handleFreightQuoted forwards price as the shippingAmount', async () => {
    const { service, orderRepository } = buildService();

    await service.handleFreightQuoted('evt-4', {
      subOrderId: 'sub-1',
      orderId: 'order-1',
      carrier: 'Correios',
      price: '15.90',
      estimatedDays: 5,
    });

    expect(orderRepository.recordFreightQuoted).toHaveBeenCalledWith(
      'evt-4',
      'FreightQuoted',
      'sub-1',
      'order-1',
      '15.90',
    );
  });

  it('handleFreightQuoteFailed delegates with the reason', async () => {
    const { service, orderRepository } = buildService();

    await service.handleFreightQuoteFailed('evt-5', { subOrderId: 'sub-1', orderId: 'order-1', reason: 'no carrier' });

    expect(orderRepository.recordFreightQuoteFailed).toHaveBeenCalledWith(
      'evt-5',
      'FreightQuoteFailed',
      'sub-1',
      'order-1',
      'no carrier',
    );
  });

  it('handleShipmentDispatched/Delivered delegate with subOrderId only', async () => {
    const { service, orderRepository } = buildService();

    await service.handleShipmentDispatched('evt-6', {
      subOrderId: 'sub-1',
      orderId: 'order-1',
      userId: 'user-1',
      trackingCode: 'BR123',
      carrier: 'Correios',
      estimatedDeliveryDate: '2026-08-01',
    });
    await service.handleShipmentDelivered('evt-7', {
      subOrderId: 'sub-1',
      orderId: 'order-1',
      userId: 'user-1',
      deliveredAt: '2026-08-05',
    });

    expect(orderRepository.recordShipmentDispatched).toHaveBeenCalledWith('evt-6', 'ShipmentDispatched', 'sub-1');
    expect(orderRepository.recordShipmentDelivered).toHaveBeenCalledWith('evt-7', 'ShipmentDelivered', 'sub-1');
  });

  it('handlePaymentConfirmed extracts subOrderIds from the splits', async () => {
    const { service, orderRepository } = buildService();

    await service.handlePaymentConfirmed('evt-8', {
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

    expect(orderRepository.recordPaymentConfirmed).toHaveBeenCalledWith(
      'evt-8',
      'PaymentConfirmed',
      'order-1',
      ['sub-1', 'sub-2'],
    );
  });

  it('handlePaymentFailed delegates with the reason', async () => {
    const { service, orderRepository } = buildService();

    await service.handlePaymentFailed('evt-9', {
      paymentId: 'pay-1',
      orderId: 'order-1',
      userId: 'user-1',
      method: 'PIX',
      reason: 'declined',
    });

    expect(orderRepository.recordPaymentFailed).toHaveBeenCalledWith('evt-9', 'PaymentFailed', 'order-1', 'declined');
  });

  it('handlePaymentRefunded extracts subOrderIds from the splits', async () => {
    const { service, orderRepository } = buildService();

    await service.handlePaymentRefunded('evt-10', {
      paymentId: 'pay-1',
      orderId: 'order-1',
      userId: 'user-1',
      refundedAmount: '100.00',
      splits: [{ subOrderId: 'sub-1', sellerId: 's1', amount: '50.00' }],
    });

    expect(orderRepository.recordPaymentRefunded).toHaveBeenCalledWith('evt-10', 'PaymentRefunded', ['sub-1']);
  });
});
