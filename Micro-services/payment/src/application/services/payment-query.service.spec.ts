import { PaymentQueryService } from './payment-query.service';
import { Payment } from '../../core/entities/payment.entity';
import { SellerPaymentProfile } from '../../core/entities/seller-payment-profile.entity';
import { PaymentNotFoundException } from '../../core/exceptions/payment-not-found.exception';
import { ForbiddenPaymentAccessException } from '../../core/exceptions/forbidden-payment-access.exception';

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
  const service = new PaymentQueryService(
    paymentRepository as any,
    profileRepository as any,
    mercadoPago as any,
  );
  return { service, paymentRepository, profileRepository, mercadoPago };
}

function makePayment(overrides: Partial<ConstructorParameters<typeof Payment>[0]> = {}): Payment {
  return new Payment({
    id: 'pay-1',
    orderId: 'order-1',
    userId: 'user-1',
    method: 'PIX',
    status: 'PENDING',
    totalAmount: '130.00',
    mpPaymentId: null,
    mpPreferenceId: 'pref-1',
    splits: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('PaymentQueryService.getByOrderId', () => {
  it('returns the payment plus a derived init_point when it belongs to the user', async () => {
    const { service, paymentRepository, mercadoPago } = build();
    paymentRepository.findByOrderId.mockResolvedValue(makePayment());
    mercadoPago.buildInitPoint.mockReturnValue('http://checkout/pref-1');

    const result = await service.getByOrderId('user-1', 'order-1');

    expect(mercadoPago.buildInitPoint).toHaveBeenCalledWith('pref-1');
    expect(result.initPoint).toBe('http://checkout/pref-1');
    expect(result.payment.orderId).toBe('order-1');
  });

  it('returns null init_point when there is no preference yet', async () => {
    const { service, paymentRepository, mercadoPago } = build();
    paymentRepository.findByOrderId.mockResolvedValue(makePayment({ mpPreferenceId: null }));

    const result = await service.getByOrderId('user-1', 'order-1');
    expect(result.initPoint).toBeNull();
    expect(mercadoPago.buildInitPoint).not.toHaveBeenCalled();
  });

  it('throws PaymentNotFound when there is no payment for the order', async () => {
    const { service, paymentRepository } = build();
    paymentRepository.findByOrderId.mockResolvedValue(null);
    await expect(service.getByOrderId('user-1', 'order-1')).rejects.toBeInstanceOf(
      PaymentNotFoundException,
    );
  });

  it('throws Forbidden when the payment belongs to another user', async () => {
    const { service, paymentRepository } = build();
    paymentRepository.findByOrderId.mockResolvedValue(makePayment({ userId: 'someone-else' }));
    await expect(service.getByOrderId('user-1', 'order-1')).rejects.toBeInstanceOf(
      ForbiddenPaymentAccessException,
    );
  });
});

describe('PaymentQueryService.getSplitsForUser', () => {
  it('resolves the user seller(s) and returns only their splits', async () => {
    const { service, paymentRepository, profileRepository } = build();
    profileRepository.findByUserId.mockResolvedValue([
      new SellerPaymentProfile({ sellerId: 'seller-1', userId: 'user-1', mpCollectorId: 'mp-1' }),
    ]);
    paymentRepository.findSplitsBySellerIds.mockResolvedValue([{ id: 'split-1' }]);

    const result = await service.getSplitsForUser('user-1');

    expect(paymentRepository.findSplitsBySellerIds).toHaveBeenCalledWith(['seller-1']);
    expect(result).toEqual([{ id: 'split-1' }]);
  });

  it('returns an empty list when the user is not a seller', async () => {
    const { service, paymentRepository, profileRepository } = build();
    profileRepository.findByUserId.mockResolvedValue([]);
    paymentRepository.findSplitsBySellerIds.mockResolvedValue([]);

    const result = await service.getSplitsForUser('user-1');
    expect(paymentRepository.findSplitsBySellerIds).toHaveBeenCalledWith([]);
    expect(result).toEqual([]);
  });
});
