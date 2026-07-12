import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/adapters/out/database/prisma.service';
import { OrderEventsConsumer } from '../src/adapters/in/messaging/order-events.consumer';
import { PaymentEventsConsumer } from '../src/adapters/in/messaging/payment-events.consumer';
import { FreightQuoteNotFoundException } from '../src/core/exceptions/freight-quote-not-found.exception';

// Exercita o roteamento por eventType + inbox (ProcessedEvent) + outbox (OutboxEvent), chamando os
// handlers dos consumers direto com envelopes mockados (não sobe broker real) — como pedido no brief.
function fakeMessage(topic: string, envelope: unknown): KafkaJS.EachMessagePayload {
  return {
    topic,
    partition: 0,
    message: { value: Buffer.from(JSON.stringify(envelope)) },
  } as unknown as KafkaJS.EachMessagePayload;
}

function envelope(eventType: string, payload: unknown, eventId = randomUUID()) {
  return {
    eventId,
    eventType,
    aggregateType: 'Test',
    aggregateId: randomUUID(),
    occurredAt: new Date().toISOString(),
    version: 1,
    payload,
  };
}

describe('Shipping event consumption + inbox/outbox (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orderConsumer: OrderEventsConsumer;
  let paymentConsumer: PaymentEventsConsumer;

  const userId = randomUUID();
  const sellerId = randomUUID();
  const createdAddressIds: string[] = [];
  const createdSubOrderIds: string[] = [];
  const createdProcessedEventIds: string[] = [];
  const createdOutboxIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
    orderConsumer = app.get(OrderEventsConsumer);
    paymentConsumer = app.get(PaymentEventsConsumer);

    // Endereço de origem do seller + endereço de entrega do cliente (necessários pra cotação oficial).
    const sellerAddress = await prisma.address.create({
      data: {
        ownerType: 'SELLER',
        ownerId: sellerId,
        cep: '04001-000',
        street: 'Origem',
        number: '1',
        neighborhood: 'B',
        city: 'SP',
        state: 'SP',
      },
    });
    const customerAddress = await prisma.address.create({
      data: {
        ownerType: 'CUSTOMER',
        ownerId: userId,
        cep: '20040-020',
        street: 'Destino',
        number: '2',
        neighborhood: 'B',
        city: 'RJ',
        state: 'RJ',
      },
    });
    createdAddressIds.push(sellerAddress.id, customerAddress.id);
    (globalThis as any).__customerAddressId = customerAddress.id;
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { id: { in: createdOutboxIds } } });
    await prisma.processedEvent.deleteMany({ where: { id: { in: createdProcessedEventIds } } });
    await prisma.shipment.deleteMany({ where: { subOrderId: { in: createdSubOrderIds } } });
    await prisma.freightQuote.deleteMany({ where: { subOrderId: { in: createdSubOrderIds } } });
    await prisma.address.deleteMany({ where: { id: { in: createdAddressIds } } });
    await app.close();
  });

  it('OrderCreated persists a FreightQuote (with addressId) + FreightQuoted outbox, and dedupes on redelivery', async () => {
    const subOrderId = randomUUID();
    createdSubOrderIds.push(subOrderId);
    const addressId = (globalThis as any).__customerAddressId as string;
    const orderId = randomUUID();

    const payload = {
      orderId,
      userId,
      addressId,
      subOrders: [
        {
          subOrderId,
          sellerId,
          items: [
            { variantId: 'v1', sku: 'S1', quantity: 1, weightGrams: 800, heightCm: 10, widthCm: 10, lengthCm: 10 },
          ],
        },
      ],
    };
    const env = envelope('OrderCreated', payload);

    await orderConsumer.handle(fakeMessage('order-events', env));

    const quote = await prisma.freightQuote.findUniqueOrThrow({ where: { subOrderId } });
    expect(quote.addressId).toBe(addressId);
    expect(quote.price.toFixed(2)).toMatch(/^\d+\.\d{2}$/);

    const outbox = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: subOrderId, eventType: 'FreightQuoted' },
    });
    createdOutboxIds.push(outbox.id);
    const processed = await prisma.processedEvent.findUniqueOrThrow({ where: { eventId: env.eventId } });
    createdProcessedEventIds.push(processed.id);

    // Redelivery do MESMO eventId: no-op, não duplica quote nem outbox.
    await orderConsumer.handle(fakeMessage('order-events', env));
    const quoteCount = await prisma.freightQuote.count({ where: { subOrderId } });
    expect(quoteCount).toBe(1);
  });

  it('OrderCreated with an unknown seller origin enqueues FreightQuoteFailed and no FreightQuote', async () => {
    const subOrderId = randomUUID();
    createdSubOrderIds.push(subOrderId);
    const env = envelope('OrderCreated', {
      orderId: randomUUID(),
      userId,
      addressId: (globalThis as any).__customerAddressId,
      subOrders: [{ subOrderId, sellerId: randomUUID(), items: [] }],
    });

    await orderConsumer.handle(fakeMessage('order-events', env));

    const quote = await prisma.freightQuote.findUnique({ where: { subOrderId } });
    expect(quote).toBeNull();
    const failed = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: subOrderId, eventType: 'FreightQuoteFailed' },
    });
    createdOutboxIds.push(failed.id);
    const processed = await prisma.processedEvent.findUniqueOrThrow({ where: { eventId: env.eventId } });
    createdProcessedEventIds.push(processed.id);
  });

  it('PaymentConfirmed creates a Shipment from the FreightQuote (orderId/userId denormalized), idempotent on redelivery', async () => {
    // pré-condição: cria uma FreightQuote pro subOrder
    const subOrderId = randomUUID();
    createdSubOrderIds.push(subOrderId);
    const addressId = (globalThis as any).__customerAddressId as string;
    const orderId = randomUUID();
    await prisma.freightQuote.create({
      data: {
        subOrderId,
        originCep: '04001-000',
        destinationCep: '20040-020',
        carrier: 'PAC',
        price: '22.50',
        estimatedDays: 6,
        addressId,
      },
    });

    const env = envelope('PaymentConfirmed', {
      paymentId: randomUUID(),
      orderId,
      userId,
      method: 'PIX',
      totalAmount: 100,
      splits: [{ subOrderId, sellerId, amount: 90, platformFeeAmount: 10 }],
    });

    await paymentConsumer.handle(fakeMessage('payment-events', env));

    const shipment = await prisma.shipment.findUniqueOrThrow({ where: { subOrderId } });
    expect(shipment.orderId).toBe(orderId);
    expect(shipment.userId).toBe(userId);
    expect(shipment.addressId).toBe(addressId);
    expect(shipment.status).toBe('LABEL_PENDING');
    const processed = await prisma.processedEvent.findUniqueOrThrow({ where: { eventId: env.eventId } });
    createdProcessedEventIds.push(processed.id);

    await paymentConsumer.handle(fakeMessage('payment-events', env));
    const count = await prisma.shipment.count({ where: { subOrderId } });
    expect(count).toBe(1);
  });

  it('PaymentConfirmed without a FreightQuote throws (Kafka redelivers) and leaves no ProcessedEvent', async () => {
    const subOrderId = randomUUID();
    const env = envelope('PaymentConfirmed', {
      paymentId: randomUUID(),
      orderId: randomUUID(),
      userId,
      method: 'PIX',
      totalAmount: 10,
      splits: [{ subOrderId, sellerId, amount: 10, platformFeeAmount: 1 }],
    });

    await expect(paymentConsumer.handle(fakeMessage('payment-events', env))).rejects.toThrow(
      FreightQuoteNotFoundException,
    );
    expect(await prisma.processedEvent.findUnique({ where: { eventId: env.eventId } })).toBeNull();
  });

  it('ignores events it does not care about (OrderCancelled, PaymentFailed)', async () => {
    await expect(
      orderConsumer.handle(fakeMessage('order-events', envelope('OrderCancelled', {}))),
    ).resolves.toBeUndefined();
    await expect(
      paymentConsumer.handle(fakeMessage('payment-events', envelope('PaymentFailed', {}))),
    ).resolves.toBeUndefined();
  });
});
