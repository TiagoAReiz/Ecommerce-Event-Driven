import { PaymentRepository } from './payment.repository';

function buildTx() {
  return {
    processedEvent: { findUnique: jest.fn(), create: jest.fn() },
    mpWebhookEvent: { findUnique: jest.fn(), create: jest.fn() },
    payment: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    paymentSplit: { updateMany: jest.fn() },
    outboxEvent: { create: jest.fn() },
  };
}

function buildRepo() {
  const tx = buildTx();
  const prisma = {
    $transaction: jest.fn((cb: any) => cb(tx)),
    payment: { findFirst: jest.fn() },
    paymentSplit: { findMany: jest.fn() },
  } as any;
  return { repo: new PaymentRepository(prisma), prisma, tx };
}

function pendingPaymentRow() {
  return {
    id: 'pay-1',
    orderId: 'order-1',
    userId: 'user-1',
    method: 'PIX',
    status: 'PENDING',
    totalAmount: 130,
    mpPaymentId: null,
    mpPreferenceId: 'pref-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    splits: [
      { id: 's1', paymentId: 'pay-1', subOrderId: 'sub-1', sellerId: 'seller-1', mpCollectorId: 'mp-1', amount: 110, platformFeeAmount: 10, status: 'PENDING' },
    ],
  };
}

describe('PaymentRepository.createPaymentWithSplits', () => {
  it('returns null (no-op) when the eventId was already processed', async () => {
    const { repo, tx } = buildRepo();
    tx.processedEvent.findUnique.mockResolvedValue({ id: 'p', eventId: 'evt-1' });

    const result = await repo.createPaymentWithSplits('evt-1', 'OrderReadyForPayment', {
      orderId: 'order-1',
      userId: 'user-1',
      method: 'PIX',
      totalAmount: '130.00',
      mpPreferenceId: 'pref-1',
      splits: [],
    });

    expect(result).toBeNull();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('creates the payment + splits + inbox row when fresh', async () => {
    const { repo, tx } = buildRepo();
    tx.processedEvent.findUnique.mockResolvedValue(null);
    tx.payment.create.mockResolvedValue(pendingPaymentRow());

    const result = await repo.createPaymentWithSplits('evt-1', 'OrderReadyForPayment', {
      orderId: 'order-1',
      userId: 'user-1',
      method: 'PIX',
      totalAmount: '130.00',
      mpPreferenceId: 'pref-1',
      splits: [
        { subOrderId: 'sub-1', sellerId: 'seller-1', mpCollectorId: 'mp-1', amount: '110.00', platformFeeAmount: '10.00' },
      ],
    });

    expect(tx.payment.create).toHaveBeenCalled();
    expect(tx.processedEvent.create).toHaveBeenCalledWith({
      data: { eventId: 'evt-1', eventType: 'OrderReadyForPayment' },
    });
    expect(result?.totalAmount).toBe('130.00');
    expect(result?.splits[0].amount).toBe('110.00');
  });
});

describe('PaymentRepository.confirmFromWebhook', () => {
  const data = {
    mpEventId: 'mp-evt-1',
    type: 'payment',
    rawPayload: {},
    orderId: 'order-1',
    mpPaymentId: 'mp-pay-1',
    method: 'PIX' as const,
  };

  it('is a no-op (published=false) on a duplicate mpEventId', async () => {
    const { repo, tx } = buildRepo();
    tx.mpWebhookEvent.findUnique.mockResolvedValue({ id: 'w', mpEventId: 'mp-evt-1' });

    const result = await repo.confirmFromWebhook(data);

    expect(result).toEqual({ published: false });
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('promotes a PENDING payment to APPROVED, settles splits and writes PaymentConfirmed to the outbox', async () => {
    const { repo, tx } = buildRepo();
    tx.mpWebhookEvent.findUnique.mockResolvedValue(null);
    tx.payment.findFirst.mockResolvedValue(pendingPaymentRow());

    const result = await repo.confirmFromWebhook(data);

    expect(result).toEqual({ published: true });
    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: 'pay-1' },
      data: { status: 'APPROVED', mpPaymentId: 'mp-pay-1', method: 'PIX' },
    });
    expect(tx.paymentSplit.updateMany).toHaveBeenCalledWith({
      where: { paymentId: 'pay-1' },
      data: { status: 'SETTLED' },
    });
    const outbox = tx.outboxEvent.create.mock.calls[0][0].data;
    expect(outbox.eventType).toBe('PaymentConfirmed');
    expect(outbox.aggregateId).toBe('order-1'); // key = orderId
    expect(outbox.payload.totalAmount).toBe('130.00');
    expect(outbox.payload.splits[0]).toEqual({
      subOrderId: 'sub-1',
      sellerId: 'seller-1',
      amount: '110.00',
      platformFeeAmount: '10.00',
    });
  });

  it('does not publish when the payment is not PENDING', async () => {
    const { repo, tx } = buildRepo();
    tx.mpWebhookEvent.findUnique.mockResolvedValue(null);
    tx.payment.findFirst.mockResolvedValue({ ...pendingPaymentRow(), status: 'APPROVED' });

    const result = await repo.confirmFromWebhook(data);

    expect(result).toEqual({ published: false });
    expect(tx.mpWebhookEvent.create).toHaveBeenCalled(); // still recorded
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
  });
});

describe('PaymentRepository.refundOnCancel', () => {
  it('refunds once and writes PaymentRefunded when APPROVED', async () => {
    const { repo, tx } = buildRepo();
    tx.processedEvent.findUnique.mockResolvedValue(null);
    tx.payment.findFirst.mockResolvedValue({
      ...pendingPaymentRow(),
      status: 'APPROVED',
      mpPaymentId: 'mp-pay-1',
    });
    const refundFn = jest.fn().mockResolvedValue({ refundId: 'r1' });

    const result = await repo.refundOnCancel('evt-c', 'OrderCancelled', 'order-1', refundFn);

    expect(refundFn).toHaveBeenCalledTimes(1);
    expect(refundFn).toHaveBeenCalledWith('mp-pay-1');
    expect(tx.payment.update).toHaveBeenCalledWith({ where: { id: 'pay-1' }, data: { status: 'REFUNDED' } });
    const outbox = tx.outboxEvent.create.mock.calls[0][0].data;
    expect(outbox.eventType).toBe('PaymentRefunded');
    expect(outbox.payload.refundedAmount).toBe('130.00');
    expect(outbox.payload.splits[0]).toEqual({ subOrderId: 'sub-1', sellerId: 'seller-1', amount: '110.00' });
    expect(tx.processedEvent.create).toHaveBeenCalled();
    expect(result).toEqual({ refunded: true, alreadyProcessed: false });
  });

  it('is a no-op refund when the payment was never approved (still records inbox)', async () => {
    const { repo, tx } = buildRepo();
    tx.processedEvent.findUnique.mockResolvedValue(null);
    tx.payment.findFirst.mockResolvedValue(pendingPaymentRow()); // PENDING
    const refundFn = jest.fn();

    const result = await repo.refundOnCancel('evt-c', 'OrderCancelled', 'order-1', refundFn);

    expect(refundFn).not.toHaveBeenCalled();
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
    expect(tx.processedEvent.create).toHaveBeenCalled();
    expect(result).toEqual({ refunded: false, alreadyProcessed: false });
  });

  it('is a full no-op when the event was already processed', async () => {
    const { repo, tx } = buildRepo();
    tx.processedEvent.findUnique.mockResolvedValue({ id: 'p', eventId: 'evt-c' });
    const refundFn = jest.fn();

    const result = await repo.refundOnCancel('evt-c', 'OrderCancelled', 'order-1', refundFn);

    expect(refundFn).not.toHaveBeenCalled();
    expect(tx.processedEvent.create).not.toHaveBeenCalled();
    expect(result).toEqual({ refunded: false, alreadyProcessed: true });
  });
});

describe('PaymentRepository.findSplitsBySellerIds', () => {
  it('short-circuits to empty when there are no seller ids', async () => {
    const { repo, prisma } = buildRepo();
    const result = await repo.findSplitsBySellerIds([]);
    expect(result).toEqual([]);
    expect(prisma.paymentSplit.findMany).not.toHaveBeenCalled();
  });

  it('maps split rows to fixed-2 views including the parent orderId', async () => {
    const { repo, prisma } = buildRepo();
    prisma.paymentSplit.findMany.mockResolvedValue([
      {
        id: 's1',
        paymentId: 'pay-1',
        subOrderId: 'sub-1',
        sellerId: 'seller-1',
        amount: 110,
        platformFeeAmount: 10,
        status: 'SETTLED',
        createdAt: new Date('2026-01-01'),
        payment: { orderId: 'order-1' },
      },
    ]);

    const result = await repo.findSplitsBySellerIds(['seller-1']);

    expect(result[0]).toMatchObject({
      id: 's1',
      orderId: 'order-1',
      amount: '110.00',
      platformFeeAmount: '10.00',
      status: 'SETTLED',
    });
  });
});
