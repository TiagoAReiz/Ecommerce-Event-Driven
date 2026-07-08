import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('auth-db schema', () => {
  let prisma: PrismaService;
  const createdUserIds: string[] = [];
  const createdOutboxIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { id: { in: createdOutboxIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.onModuleDestroy();
  });

  it('creates a User with default role CUSTOMER', async () => {
    const user = await prisma.user.create({
      data: {
        googleId: `google-${randomUUID()}`,
        email: `${randomUUID()}@example.com`,
        name: 'Test User',
      },
    });
    createdUserIds.push(user.id);

    expect(user.role).toBe('CUSTOMER');
  });

  it('rejects a duplicate googleId', async () => {
    const googleId = `google-${randomUUID()}`;
    const user = await prisma.user.create({
      data: { googleId, email: `${randomUUID()}@example.com`, name: 'Original' },
    });
    createdUserIds.push(user.id);

    await expect(
      prisma.user.create({
        data: { googleId, email: `${randomUUID()}@example.com`, name: 'Duplicate' },
      }),
    ).rejects.toThrow();
  });

  it('creates an OutboxEvent with default status PENDING', async () => {
    const event = await prisma.outboxEvent.create({
      data: {
        aggregateType: 'User',
        aggregateId: randomUUID(),
        eventType: 'UserRegistered',
        payload: { email: 'test@example.com' },
      },
    });
    createdOutboxIds.push(event.id);

    expect(event.status).toBe('PENDING');
  });
});
