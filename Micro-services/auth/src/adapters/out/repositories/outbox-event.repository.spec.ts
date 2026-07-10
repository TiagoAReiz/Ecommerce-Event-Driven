import { OutboxEventRepository } from './outbox-event.repository';
import { OutboxEvent } from '../../../core/entities/outbox-event.entity';

function buildRepo() {
  const prisma = { outboxEvent: { findMany: jest.fn(), update: jest.fn() } } as any;
  return { repo: new OutboxEventRepository(prisma), prisma };
}

describe('OutboxEventRepository', () => {
  it('queries PENDING events oldest-first with the given limit and maps to entities', async () => {
    const { repo, prisma } = buildRepo();
    prisma.outboxEvent.findMany.mockResolvedValue([
      {
        id: 'evt-1',
        aggregateType: 'User',
        aggregateId: 'user-1',
        eventType: 'UserRegistered',
        payload: { userId: 'user-1' },
        status: 'PENDING',
        createdAt: new Date('2026-07-10T10:00:00Z'),
        updatedAt: new Date('2026-07-10T10:00:00Z'),
        publishedAt: null,
      },
    ]);

    const events = await repo.findPending(20);

    expect(prisma.outboxEvent.findMany).toHaveBeenCalledWith({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(OutboxEvent);
    expect(events[0].eventType).toBe('UserRegistered');
  });

  it('marks an event PUBLISHED with a publishedAt timestamp', async () => {
    const { repo, prisma } = buildRepo();
    prisma.outboxEvent.update.mockResolvedValue({});

    await repo.markPublished('evt-1');

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { status: 'PUBLISHED', publishedAt: expect.any(Date) },
    });
  });
});
