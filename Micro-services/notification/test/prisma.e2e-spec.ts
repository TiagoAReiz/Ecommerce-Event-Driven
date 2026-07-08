import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('notification-db schema', () => {
  let prisma: PrismaService;
  const createdLogIds: string[] = [];
  const createdProcessedEventIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.notificationLog.deleteMany({ where: { id: { in: createdLogIds } } });
    await prisma.processedEvent.deleteMany({ where: { id: { in: createdProcessedEventIds } } });
    await prisma.onModuleDestroy();
  });

  it('creates a NotificationLog with default status PENDING', async () => {
    const log = await prisma.notificationLog.create({
      data: {
        userId: randomUUID(),
        type: 'ORDER_CREATED',
        recipientEmail: `${randomUUID()}@example.com`,
        subject: 'Seu pedido foi criado',
      },
    });
    createdLogIds.push(log.id);
    expect(log.status).toBe('PENDING');
  });

  it('rejects a duplicate ProcessedEvent eventId', async () => {
    const eventId = randomUUID();
    const processed = await prisma.processedEvent.create({
      data: { eventId, eventType: 'PaymentConfirmed' },
    });
    createdProcessedEventIds.push(processed.id);

    await expect(
      prisma.processedEvent.create({ data: { eventId, eventType: 'PaymentConfirmed' } }),
    ).rejects.toThrow();
  });
});
