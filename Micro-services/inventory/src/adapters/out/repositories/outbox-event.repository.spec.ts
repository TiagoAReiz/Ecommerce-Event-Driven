import { OutboxEventRepository } from './outbox-event.repository';
import { OutboxEvent } from '../../../core/entities/outbox-event.entity';

function buildRepo() {
  const prisma = {
    outboxEvent: { findMany: jest.fn(), update: jest.fn() },
  } as any;
  return { repo: new OutboxEventRepository(prisma), prisma };
}

describe('OutboxEventRepository', () => {
  it('findPending returns PENDING events oldest-first mapped to entities', async () => {
    const { repo, prisma } = buildRepo();
    prisma.outboxEvent.findMany.mockResolvedValue([
      {
        id: 'evt-1',
        aggregateType: 'StockReservation',
        aggregateId: 'sub-1',
        eventType: 'StockReserved',
        payload: { subOrderId: 'sub-1' },
        createdAt: new Date('2026-07-11T09:00:00.000Z'),
      },
    ]);

    const result = await repo.findPending(20);

    expect(prisma.outboxEvent.findMany).toHaveBeenCalledWith({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    expect(result[0]).toBeInstanceOf(OutboxEvent);
    expect(result[0].aggregateId).toBe('sub-1');
  });

  it('markPublished flips status to PUBLISHED with a publishedAt timestamp', async () => {
    const { repo, prisma } = buildRepo();

    await repo.markPublished('evt-1');

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { status: 'PUBLISHED', publishedAt: expect.any(Date) },
    });
  });
});
