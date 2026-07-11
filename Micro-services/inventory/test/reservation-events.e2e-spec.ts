import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/adapters/out/database/prisma.service';
import { OrderEventsConsumer } from '../src/adapters/in/messaging/order-events.consumer';
import { PaymentEventsConsumer } from '../src/adapters/in/messaging/payment-events.consumer';

// Drives the in-adapters directly with mocked Kafka envelopes (no broker). Asserts DB effects
// (reservedQty / StockReservation / StockItem) + the outbox rows that the relay would publish,
// and the inbox (ProcessedEvent) dedupe on redelivery.
function envelope(topic: string, eventType: string, eventId: string, payload: unknown): KafkaJS.EachMessagePayload {
  const body = {
    eventId,
    eventType,
    aggregateType: 'Order',
    aggregateId: 'agg-1',
    occurredAt: new Date().toISOString(),
    version: 1,
    payload,
  };
  return { topic, message: { value: Buffer.from(JSON.stringify(body)) } } as KafkaJS.EachMessagePayload;
}

describe('Reactive stock events (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orderConsumer: OrderEventsConsumer;
  let paymentConsumer: PaymentEventsConsumer;

  const variantIds: string[] = [];
  const subOrderIds: string[] = [];
  const eventIds: string[] = [];

  function trackVariant(): string {
    const id = randomUUID();
    variantIds.push(id);
    return id;
  }
  function trackSubOrder(): string {
    const id = randomUUID();
    subOrderIds.push(id);
    return id;
  }
  function trackEvent(): string {
    const id = randomUUID();
    eventIds.push(id);
    return id;
  }

  async function outboxFor(subOrderId: string, eventType: string) {
    return prisma.outboxEvent.findMany({ where: { aggregateId: subOrderId, eventType } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    orderConsumer = app.get(OrderEventsConsumer);
    paymentConsumer = app.get(PaymentEventsConsumer);
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: subOrderIds } } });
    await prisma.stockReservation.deleteMany({ where: { subOrderId: { in: subOrderIds } } });
    await prisma.stockItem.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.processedEvent.deleteMany({ where: { eventId: { in: eventIds } } });
    await app.close();
  });

  it('OrderCreated reserves stock (reservedQty += q) and writes a StockReserved outbox row', async () => {
    const variantId = trackVariant();
    const subOrderId = trackSubOrder();
    const orderId = randomUUID();
    const eventId = trackEvent();
    await prisma.stockItem.create({
      data: { variantId, sellerId: 'seller-1', quantity: 10, reservedQty: 0 },
    });

    await orderConsumer.handle(
      envelope('order-events', 'OrderCreated', eventId, {
        orderId,
        userId: 'user-1',
        addressId: 'addr-1',
        subOrders: [
          { subOrderId, sellerId: 'seller-1', items: [{ variantId, sku: 'SKU', quantity: 3 }] },
        ],
      }),
    );

    const stock = await prisma.stockItem.findUnique({ where: { variantId } });
    expect(stock!.quantity).toBe(10);
    expect(stock!.reservedQty).toBe(3);

    const reservations = await prisma.stockReservation.findMany({ where: { subOrderId } });
    expect(reservations).toHaveLength(1);
    expect(reservations[0].status).toBe('PENDING');

    const outbox = await outboxFor(subOrderId, 'StockReserved');
    expect(outbox).toHaveLength(1);
    expect(outbox[0].payload).toMatchObject({ subOrderId, orderId });
  });

  it('OrderCreated redelivery is idempotent (inbox dedupe): no double reservedQty, one outbox row', async () => {
    const variantId = trackVariant();
    const subOrderId = trackSubOrder();
    const eventId = trackEvent();
    await prisma.stockItem.create({
      data: { variantId, sellerId: 'seller-1', quantity: 10, reservedQty: 0 },
    });
    const message = envelope('order-events', 'OrderCreated', eventId, {
      orderId: randomUUID(),
      userId: 'user-1',
      addressId: 'addr-1',
      subOrders: [{ subOrderId, sellerId: 'seller-1', items: [{ variantId, sku: 'SKU', quantity: 2 }] }],
    });

    await orderConsumer.handle(message);
    await orderConsumer.handle(message); // redelivery with the same eventId

    const stock = await prisma.stockItem.findUnique({ where: { variantId } });
    expect(stock!.reservedQty).toBe(2); // not 4
    expect(await prisma.stockReservation.count({ where: { subOrderId } })).toBe(1);
    expect(await outboxFor(subOrderId, 'StockReserved')).toHaveLength(1);
  });

  it('OrderCreated with insufficient stock emits StockReservationFailed and reserves nothing', async () => {
    const variantId = trackVariant();
    const subOrderId = trackSubOrder();
    const eventId = trackEvent();
    await prisma.stockItem.create({
      data: { variantId, sellerId: 'seller-1', quantity: 1, reservedQty: 0 },
    });

    await orderConsumer.handle(
      envelope('order-events', 'OrderCreated', eventId, {
        orderId: randomUUID(),
        userId: 'user-1',
        addressId: 'addr-1',
        subOrders: [{ subOrderId, sellerId: 'seller-1', items: [{ variantId, sku: 'SKU', quantity: 5 }] }],
      }),
    );

    const stock = await prisma.stockItem.findUnique({ where: { variantId } });
    expect(stock!.reservedQty).toBe(0);
    expect(await prisma.stockReservation.count({ where: { subOrderId } })).toBe(0);
    const failed = await outboxFor(subOrderId, 'StockReservationFailed');
    expect(failed).toHaveLength(1);
    expect(failed[0].payload).toMatchObject({
      failedItems: [{ variantId, requestedQty: 5, availableQty: 1 }],
    });
  });

  it('PaymentConfirmed confirms the baixa (quantity -= q, reservedQty -= q, no StockReleased)', async () => {
    const variantId = trackVariant();
    const subOrderId = trackSubOrder();
    const reserveEvent = trackEvent();
    const confirmEvent = trackEvent();
    await prisma.stockItem.create({
      data: { variantId, sellerId: 'seller-1', quantity: 10, reservedQty: 0 },
    });
    await orderConsumer.handle(
      envelope('order-events', 'OrderCreated', reserveEvent, {
        orderId: randomUUID(),
        userId: 'user-1',
        addressId: 'addr-1',
        subOrders: [{ subOrderId, sellerId: 'seller-1', items: [{ variantId, sku: 'SKU', quantity: 4 }] }],
      }),
    );

    await paymentConsumer.handle(
      envelope('payment-events', 'PaymentConfirmed', confirmEvent, {
        paymentId: 'pay-1',
        orderId: randomUUID(),
        userId: 'user-1',
        method: 'PIX',
        totalAmount: '100.00',
        splits: [{ subOrderId, sellerId: 'seller-1', amount: '90.00', platformFeeAmount: '10.00' }],
      }),
    );

    const stock = await prisma.stockItem.findUnique({ where: { variantId } });
    expect(stock!.quantity).toBe(6);
    expect(stock!.reservedQty).toBe(0);
    const reservation = await prisma.stockReservation.findFirst({ where: { subOrderId } });
    expect(reservation!.status).toBe('CONFIRMED');
    expect(await outboxFor(subOrderId, 'StockReleased')).toHaveLength(0);
  });

  it('OrderCancelled releases reservations (reservedQty back) and emits StockReleased ORDER_CANCELLED', async () => {
    const variantId = trackVariant();
    const subOrderId = trackSubOrder();
    const reserveEvent = trackEvent();
    const cancelEvent = trackEvent();
    await prisma.stockItem.create({
      data: { variantId, sellerId: 'seller-1', quantity: 10, reservedQty: 0 },
    });
    await orderConsumer.handle(
      envelope('order-events', 'OrderCreated', reserveEvent, {
        orderId: randomUUID(),
        userId: 'user-1',
        addressId: 'addr-1',
        subOrders: [{ subOrderId, sellerId: 'seller-1', items: [{ variantId, sku: 'SKU', quantity: 3 }] }],
      }),
    );

    await orderConsumer.handle(
      envelope('order-events', 'OrderCancelled', cancelEvent, {
        orderId: randomUUID(),
        userId: 'user-1',
        subOrderIds: [subOrderId],
        cancelReason: 'changed my mind',
        initiatedBy: 'CUSTOMER',
      }),
    );

    const stock = await prisma.stockItem.findUnique({ where: { variantId } });
    expect(stock!.reservedQty).toBe(0);
    const reservation = await prisma.stockReservation.findFirst({ where: { subOrderId } });
    expect(reservation!.status).toBe('RELEASED');
    const released = await outboxFor(subOrderId, 'StockReleased');
    expect(released).toHaveLength(1);
    expect(released[0].payload).toMatchObject({
      reason: 'ORDER_CANCELLED',
      releasedItems: [{ variantId, quantity: 3 }],
    });
  });

  it('PaymentFailed recovers subOrders from the outbox and releases with reason PAYMENT_FAILED', async () => {
    const variantId = trackVariant();
    const subOrderId = trackSubOrder();
    const orderId = randomUUID();
    const reserveEvent = trackEvent();
    const failEvent = trackEvent();
    await prisma.stockItem.create({
      data: { variantId, sellerId: 'seller-1', quantity: 10, reservedQty: 0 },
    });
    await orderConsumer.handle(
      envelope('order-events', 'OrderCreated', reserveEvent, {
        orderId,
        userId: 'user-1',
        addressId: 'addr-1',
        subOrders: [{ subOrderId, sellerId: 'seller-1', items: [{ variantId, sku: 'SKU', quantity: 2 }] }],
      }),
    );

    await paymentConsumer.handle(
      envelope('payment-events', 'PaymentFailed', failEvent, {
        paymentId: 'pay-1',
        orderId,
        userId: 'user-1',
        method: 'PIX',
        reason: 'declined',
      }),
    );

    const stock = await prisma.stockItem.findUnique({ where: { variantId } });
    expect(stock!.reservedQty).toBe(0);
    const released = await outboxFor(subOrderId, 'StockReleased');
    expect(released).toHaveLength(1);
    expect(released[0].payload).toMatchObject({ reason: 'PAYMENT_FAILED' });
  });
});
