import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('payment-db schema', () => {
  let prisma: PrismaService;
  const createdPaymentIds: string[] = [];
  const createdSplitIds: string[] = [];
  const createdWebhookIds: string[] = [];
  const createdSellerProfileIds: string[] = [];
  const createdOutboxIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { id: { in: createdOutboxIds } } });
    await prisma.mpWebhookEvent.deleteMany({ where: { id: { in: createdWebhookIds } } });
    await prisma.paymentSplit.deleteMany({ where: { id: { in: createdSplitIds } } });
    await prisma.payment.deleteMany({ where: { id: { in: createdPaymentIds } } });
    await prisma.sellerPaymentProfile.deleteMany({
      where: { sellerId: { in: createdSellerProfileIds } },
    });
    await prisma.onModuleDestroy();
  });

  it('creates a Payment with a split per seller', async () => {
    const sellerId = randomUUID();
    const profile = await prisma.sellerPaymentProfile.create({
      data: { sellerId, userId: randomUUID(), mpCollectorId: 'mp-collector-1' },
    });
    createdSellerProfileIds.push(profile.sellerId);

    const payment = await prisma.payment.create({
      data: {
        orderId: randomUUID(),
        userId: randomUUID(),
        method: 'PIX',
        totalAmount: '150.00',
      },
    });
    createdPaymentIds.push(payment.id);
    expect(payment.status).toBe('PENDING');

    const split = await prisma.paymentSplit.create({
      data: {
        paymentId: payment.id,
        subOrderId: randomUUID(),
        sellerId,
        mpCollectorId: profile.mpCollectorId,
        amount: '135.00',
        platformFeeAmount: '15.00',
      },
    });
    createdSplitIds.push(split.id);
    expect(split.status).toBe('PENDING');
  });

  it('rejects a duplicate mpEventId in MpWebhookEvent', async () => {
    const mpEventId = randomUUID();
    const webhook = await prisma.mpWebhookEvent.create({
      data: { mpEventId, type: 'payment.updated', rawPayload: { id: 1 } },
    });
    createdWebhookIds.push(webhook.id);

    await expect(
      prisma.mpWebhookEvent.create({
        data: { mpEventId, type: 'payment.updated', rawPayload: { id: 1 } },
      }),
    ).rejects.toThrow();
  });

  it('creates an OutboxEvent with default status PENDING', async () => {
    const event = await prisma.outboxEvent.create({
      data: {
        aggregateType: 'Payment',
        aggregateId: randomUUID(),
        eventType: 'PaymentConfirmed',
        payload: { status: 'APPROVED' },
      },
    });
    createdOutboxIds.push(event.id);
    expect(event.status).toBe('PENDING');
  });
});
