import { PaymentMapper } from './payment.mapper';
import { Payment, PaymentSplit } from '../../core/entities/payment.entity';

describe('PaymentMapper', () => {
  it('toPaymentResponse maps the payment + init_point + split summary', () => {
    const payment = new Payment({
      id: 'pay-1',
      orderId: 'order-1',
      userId: 'user-1',
      method: 'PIX',
      status: 'APPROVED',
      totalAmount: '130.00',
      mpPaymentId: 'mp-1',
      mpPreferenceId: 'pref-1',
      splits: [
        new PaymentSplit({
          id: 's1',
          paymentId: 'pay-1',
          subOrderId: 'sub-1',
          sellerId: 'seller-1',
          mpCollectorId: 'mp-1',
          amount: '110.00',
          platformFeeAmount: '10.00',
          status: 'SETTLED',
        }),
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const dto = PaymentMapper.toPaymentResponse({ payment, initPoint: 'http://x' });

    expect(dto).toEqual({
      paymentId: 'pay-1',
      orderId: 'order-1',
      status: 'APPROVED',
      method: 'PIX',
      totalAmount: '130.00',
      initPoint: 'http://x',
      splits: [
        { subOrderId: 'sub-1', sellerId: 'seller-1', amount: '110.00', platformFeeAmount: '10.00', status: 'SETTLED' },
      ],
    });
  });

  it('toSplitsListResponse serializes createdAt to ISO and wraps items', () => {
    const dto = PaymentMapper.toSplitsListResponse([
      {
        id: 's1',
        paymentId: 'pay-1',
        orderId: 'order-1',
        subOrderId: 'sub-1',
        sellerId: 'seller-1',
        amount: '110.00',
        platformFeeAmount: '10.00',
        status: 'SETTLED',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    expect(dto.items[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(dto.items[0].orderId).toBe('order-1');
  });
});
