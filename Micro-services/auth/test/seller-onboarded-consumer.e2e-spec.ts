import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/adapters/out/database/prisma.service';
import { CatalogEventsConsumer } from '../src/adapters/in/messaging/catalog-events.consumer';

// Drives the CatalogEventsConsumer directly (no live Kafka needed) against the real auth-db, to
// verify SellerOnboarded -> role SELLER + UserRoleChanged outbox, and inbox dedupe on redelivery.
describe('SellerOnboarded consumer -> role promotion (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let consumer: CatalogEventsConsumer;

  const userId = randomUUID();
  const googleId = `google-${randomUUID()}`;
  const email = `${randomUUID()}@example.com`;
  const eventId = randomUUID();

  function message(evtId: string) {
    return {
      topic: 'catalog-events',
      message: {
        value: Buffer.from(
          JSON.stringify({
            eventId: evtId,
            eventType: 'SellerOnboarded',
            aggregateType: 'Seller',
            aggregateId: 'seller-1',
            occurredAt: new Date().toISOString(),
            version: 1,
            payload: {
              sellerId: 'seller-1',
              userId,
              storeName: 'Loja E2E',
              document: '12345678000199',
              mpCollectorId: 'mp-1',
            },
          }),
        ),
      },
    } as any;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    consumer = app.get(CatalogEventsConsumer);

    await prisma.user.create({
      data: { id: userId, googleId, email, name: 'Seller E2E', role: 'CUSTOMER' },
    });
  });

  afterAll(async () => {
    await prisma.processedEvent.deleteMany({ where: { eventId } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('promotes CUSTOMER -> SELLER and writes a UserRoleChanged outbox event', async () => {
    await consumer.handle(message(eventId));

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.role).toBe('SELLER');

    const outbox = await prisma.outboxEvent.findMany({
      where: { aggregateId: userId, eventType: 'UserRoleChanged' },
    });
    expect(outbox).toHaveLength(1);
    expect(outbox[0].payload).toEqual({ userId, oldRole: 'CUSTOMER', newRole: 'SELLER' });

    const processed = await prisma.processedEvent.findUnique({ where: { eventId } });
    expect(processed).not.toBeNull();
  });

  it('is idempotent: redelivering the same eventId does not emit a second event', async () => {
    await consumer.handle(message(eventId));

    const outbox = await prisma.outboxEvent.findMany({
      where: { aggregateId: userId, eventType: 'UserRoleChanged' },
    });
    expect(outbox).toHaveLength(1);
  });
});
