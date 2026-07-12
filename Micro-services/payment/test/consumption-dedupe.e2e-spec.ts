import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/adapters/out/database/prisma.service';
import { PAYMENT_EVENT_SERVICE } from '../src/core/interfaces/services/payment-event-service.interface';
import type { IPaymentEventService } from '../src/core/interfaces/services/payment-event-service.interface';

// e2e de idempotência de consumo (inbox ProcessedEvent) contra o banco real. Exercita os handlers
// diretamente pelo container do Nest, entregando o MESMO eventId duas vezes. NÃO roda no gate unit.
describe('Consumption idempotency / inbox dedupe (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let eventService: IPaymentEventService;

  const orderId = `order-${randomUUID()}`;
  const userId = `user-${randomUUID()}`;
  const sellerId = `seller-${randomUUID()}`;
  const subOrderId = `sub-${randomUUID()}`;
  const onboardEventId = `evt-onboard-${randomUUID()}`;
  const readyEventId = `evt-ready-${randomUUID()}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    eventService = app.get<IPaymentEventService>(PAYMENT_EVENT_SERVICE);
  });

  afterAll(async () => {
    await prisma.processedEvent.deleteMany({ where: { eventId: { in: [onboardEventId, readyEventId] } } });
    await prisma.paymentSplit.deleteMany({ where: { subOrderId } });
    await prisma.payment.deleteMany({ where: { orderId } });
    await prisma.sellerPaymentProfile.deleteMany({ where: { sellerId } });
    await app.close();
  });

  it('SellerOnboarded delivered twice populates the profile once (inbox no-op on replay)', async () => {
    const payload = {
      sellerId,
      userId,
      storeName: 'Loja E2E',
      document: randomUUID(),
      mpCollectorId: 'mp-collector-1',
    };

    await eventService.handleSellerOnboarded(onboardEventId, payload);
    await eventService.handleSellerOnboarded(onboardEventId, payload); // replay

    const profile = await prisma.sellerPaymentProfile.findUniqueOrThrow({ where: { sellerId } });
    expect(profile.userId).toBe(userId);

    const inbox = await prisma.processedEvent.findMany({ where: { eventId: onboardEventId } });
    expect(inbox).toHaveLength(1);
  });

  it('OrderReadyForPayment delivered twice creates exactly one Payment (inbox dedupe)', async () => {
    const payload = {
      orderId,
      userId,
      totalAmount: '130.00',
      subOrders: [
        {
          subOrderId,
          sellerId,
          subtotalAmount: '100.00',
          shippingAmount: '30.00',
          status: 'READY',
        },
      ],
    };

    await eventService.handleOrderReadyForPayment(readyEventId, payload);
    await eventService.handleOrderReadyForPayment(readyEventId, payload); // replay

    const payments = await prisma.payment.findMany({ where: { orderId }, include: { splits: true } });
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe('PENDING');
    expect(payments[0].splits).toHaveLength(1);
    // split: subtotal 100 @10% => fee 10; amount = 100 + 30 - 10 = 120
    expect(payments[0].splits[0].amount.toFixed(2)).toBe('120.00');
    expect(payments[0].splits[0].platformFeeAmount.toFixed(2)).toBe('10.00');
  });
});
