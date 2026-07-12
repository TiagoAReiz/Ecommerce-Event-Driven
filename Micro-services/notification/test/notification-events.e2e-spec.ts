import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/adapters/out/database/prisma.service';
import { AuthEventsConsumer } from '../src/adapters/in/messaging/auth-events.consumer';
import { OrderEventsConsumer } from '../src/adapters/in/messaging/order-events.consumer';
import { PaymentEventsConsumer } from '../src/adapters/in/messaging/payment-events.consumer';
import { UserContactNotFoundException } from '../src/core/exceptions/user-contact-not-found.exception';

// Exercita o roteamento por eventType + o padrão de inbox (ProcessedEvent) chamando os handlers
// dos consumers Kafka diretamente com envelopes mockados (não sobe um broker real) — como pedido
// pelo brief pra quem é puro consumer.
function fakeMessage(topic: string, envelope: unknown): KafkaJS.EachMessagePayload {
  return {
    topic,
    partition: 0,
    message: { value: Buffer.from(JSON.stringify(envelope)) },
  } as unknown as KafkaJS.EachMessagePayload;
}

describe('Notification event consumption + inbox dedupe (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authEventsConsumer: AuthEventsConsumer;
  let orderEventsConsumer: OrderEventsConsumer;
  let paymentEventsConsumer: PaymentEventsConsumer;

  const userId = randomUUID();
  const email = `${randomUUID()}@example.com`;
  const name = 'Evented User';
  const createdNotificationLogIds: string[] = [];
  const createdProcessedEventIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
    authEventsConsumer = app.get(AuthEventsConsumer);
    orderEventsConsumer = app.get(OrderEventsConsumer);
    paymentEventsConsumer = app.get(PaymentEventsConsumer);
  });

  afterAll(async () => {
    await prisma.notificationLog.deleteMany({ where: { id: { in: createdNotificationLogIds } } });
    await prisma.processedEvent.deleteMany({ where: { id: { in: createdProcessedEventIds } } });
    await prisma.userContact.deleteMany({ where: { userId } });
    await app.close();
  });

  it('UserRegistered populates UserContact and is idempotent on redelivery (same eventId)', async () => {
    const eventId = randomUUID();
    const envelope = {
      eventId,
      eventType: 'UserRegistered',
      aggregateType: 'User',
      aggregateId: userId,
      occurredAt: new Date().toISOString(),
      version: 1,
      payload: { userId, email, name, role: 'CUSTOMER' },
    };

    await authEventsConsumer.handle(fakeMessage('auth-events', envelope));

    const contact = await prisma.userContact.findUniqueOrThrow({ where: { userId } });
    expect(contact.email).toBe(email);

    const processedEvent = await prisma.processedEvent.findUniqueOrThrow({ where: { eventId } });
    createdProcessedEventIds.push(processedEvent.id);

    // Redelivery do MESMO eventId: no-op, não deve lançar nem duplicar.
    await expect(authEventsConsumer.handle(fakeMessage('auth-events', envelope))).resolves.toBeUndefined();
    const stillOneContact = await prisma.userContact.findUniqueOrThrow({ where: { userId } });
    expect(stillOneContact.email).toBe(email);
  });

  it(
    'OrderCreated resolves the recipient via UserContact, writes a NotificationLog and dedupes redelivery',
    async () => {
      const eventId = randomUUID();
      const orderId = randomUUID();
      const envelope = {
        eventId,
        eventType: 'OrderCreated',
        aggregateType: 'Order',
        aggregateId: orderId,
        occurredAt: new Date().toISOString(),
        version: 1,
        payload: { orderId, userId, addressId: randomUUID(), subOrders: [] },
      };

      await orderEventsConsumer.handle(fakeMessage('order-events', envelope));

      const log = await prisma.notificationLog.findFirstOrThrow({
        where: { userId, type: 'ORDER_CREATED', recipientEmail: email },
      });
      createdNotificationLogIds.push(log.id);
      // Stub de e-mail sempre "envia" com sucesso -> status termina SENT após o commit da tx de inbox.
      expect(log.status).toBe('SENT');

      const processedEvent = await prisma.processedEvent.findUniqueOrThrow({ where: { eventId } });
      createdProcessedEventIds.push(processedEvent.id);

      const countBefore = await prisma.notificationLog.count({ where: { userId, type: 'ORDER_CREATED' } });
      await orderEventsConsumer.handle(fakeMessage('order-events', envelope));
      const countAfter = await prisma.notificationLog.count({ where: { userId, type: 'ORDER_CREATED' } });
      expect(countAfter).toBe(countBefore);
    },
    15000,
  );

  it('PaymentConfirmed for an unknown userId throws UserContactNotFoundException and leaves no ProcessedEvent (Kafka will redeliver)', async () => {
    const eventId = randomUUID();
    const unknownUserId = randomUUID();
    const envelope = {
      eventId,
      eventType: 'PaymentConfirmed',
      aggregateType: 'Payment',
      aggregateId: randomUUID(),
      occurredAt: new Date().toISOString(),
      version: 1,
      payload: {
        paymentId: randomUUID(),
        orderId: randomUUID(),
        userId: unknownUserId,
        method: 'PIX',
        totalAmount: 100,
        splits: [],
      },
    };

    await expect(paymentEventsConsumer.handle(fakeMessage('payment-events', envelope))).rejects.toThrow(
      UserContactNotFoundException,
    );

    const processedEvent = await prisma.processedEvent.findUnique({ where: { eventId } });
    expect(processedEvent).toBeNull();
  });
});
