import { PaymentEventService } from './payment-event.service';
import { SellerPaymentProfileNotFoundException } from '../../core/exceptions/seller-payment-profile-not-found.exception';
import { SellerPaymentProfile } from '../../core/entities/seller-payment-profile.entity';

function build() {
  const paymentRepository = {
    findByOrderId: jest.fn(),
    findSplitsBySellerIds: jest.fn(),
    createPaymentWithSplits: jest.fn(),
    confirmFromWebhook: jest.fn(),
    failFromWebhook: jest.fn(),
    refundOnCancel: jest.fn(),
  };
  const profileRepository = {
    findBySellerId: jest.fn(),
    findByUserId: jest.fn(),
    upsertWithInbox: jest.fn(),
  };
  const mercadoPago = {
    createPreference: jest.fn(),
    buildInitPoint: jest.fn(),
    verifyWebhookSignature: jest.fn(),
    refund: jest.fn(),
  };
  const service = new PaymentEventService(
    paymentRepository as any,
    profileRepository as any,
    mercadoPago as any,
  );
  return { service, paymentRepository, profileRepository, mercadoPago };
}

describe('PaymentEventService.handleOrderReadyForPayment', () => {
  const payload = {
    orderId: 'order-1',
    userId: 'user-1',
    totalAmount: '130.00',
    subOrders: [
      { subOrderId: 'sub-1', sellerId: 'seller-1', subtotalAmount: '100.00', shippingAmount: '20.00', status: 'READY' },
      { subOrderId: 'sub-2', sellerId: 'seller-2', subtotalAmount: '10.00', shippingAmount: '0.00', status: 'READY' },
    ],
  };

  it('resolves each seller profile, computes splits and creates the payment + preference', async () => {
    const { service, paymentRepository, profileRepository, mercadoPago } = build();
    profileRepository.findBySellerId
      .mockResolvedValueOnce(new SellerPaymentProfile({ sellerId: 'seller-1', userId: 'u1', mpCollectorId: 'mp-1' }))
      .mockResolvedValueOnce(new SellerPaymentProfile({ sellerId: 'seller-2', userId: 'u2', mpCollectorId: 'mp-2' }));
    mercadoPago.createPreference.mockResolvedValue({ preferenceId: 'pref-1', initPoint: 'http://x' });
    paymentRepository.createPaymentWithSplits.mockResolvedValue({ id: 'pay-1' });

    await service.handleOrderReadyForPayment('evt-1', payload);

    expect(mercadoPago.createPreference).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-1', totalAmount: '130.00' }),
    );
    const createArgs = paymentRepository.createPaymentWithSplits.mock.calls[0];
    expect(createArgs[0]).toBe('evt-1');
    expect(createArgs[1]).toBe('OrderReadyForPayment');
    expect(createArgs[2]).toMatchObject({
      orderId: 'order-1',
      userId: 'user-1',
      method: 'PIX',
      totalAmount: '130.00',
      mpPreferenceId: 'pref-1',
      splits: [
        { subOrderId: 'sub-1', sellerId: 'seller-1', mpCollectorId: 'mp-1', amount: '110.00', platformFeeAmount: '10.00' },
        { subOrderId: 'sub-2', sellerId: 'seller-2', mpCollectorId: 'mp-2', amount: '9.00', platformFeeAmount: '1.00' },
      ],
    });
  });

  it('throws (reentregável) when a seller profile is missing, before touching the DB', async () => {
    const { service, paymentRepository, profileRepository, mercadoPago } = build();
    profileRepository.findBySellerId.mockResolvedValueOnce(null);

    await expect(service.handleOrderReadyForPayment('evt-1', payload)).rejects.toBeInstanceOf(
      SellerPaymentProfileNotFoundException,
    );
    expect(mercadoPago.createPreference).not.toHaveBeenCalled();
    expect(paymentRepository.createPaymentWithSplits).not.toHaveBeenCalled();
  });
});

describe('PaymentEventService.handleOrderCancelled', () => {
  const payload = {
    orderId: 'order-1',
    userId: 'user-1',
    subOrderIds: ['sub-1', 'sub-2'],
    cancelReason: 'changed mind',
    initiatedBy: 'CUSTOMER' as const,
  };

  it('delegates to repository.refundOnCancel passing the gateway refund fn', async () => {
    const { service, paymentRepository, mercadoPago } = build();
    paymentRepository.refundOnCancel.mockResolvedValue({ refunded: true, alreadyProcessed: false });

    await service.handleOrderCancelled('evt-9', payload);

    expect(paymentRepository.refundOnCancel).toHaveBeenCalledWith(
      'evt-9',
      'OrderCancelled',
      'order-1',
      expect.any(Function),
    );
    // the refund fn wires the gateway
    const refundFn = paymentRepository.refundOnCancel.mock.calls[0][3];
    await refundFn('mp-pay-1');
    expect(mercadoPago.refund).toHaveBeenCalledWith('mp-pay-1');
  });

  it('is a silent no-op when nothing was refunded (not APPROVED)', async () => {
    const { service, paymentRepository } = build();
    paymentRepository.refundOnCancel.mockResolvedValue({ refunded: false, alreadyProcessed: false });
    await expect(service.handleOrderCancelled('evt-9', payload)).resolves.toBeUndefined();
  });
});

describe('PaymentEventService.handleSellerOnboarded', () => {
  it('upserts the SellerPaymentProfile read-model with userId via inbox dedupe', async () => {
    const { service, profileRepository } = build();
    profileRepository.upsertWithInbox.mockResolvedValue(true);

    await service.handleSellerOnboarded('evt-2', {
      sellerId: 'seller-1',
      userId: 'user-1',
      storeName: 'Loja',
      document: 'doc',
      mpCollectorId: 'mp-1',
    });

    expect(profileRepository.upsertWithInbox).toHaveBeenCalledWith('evt-2', 'SellerOnboarded', {
      sellerId: 'seller-1',
      userId: 'user-1',
      mpCollectorId: 'mp-1',
    });
  });
});
