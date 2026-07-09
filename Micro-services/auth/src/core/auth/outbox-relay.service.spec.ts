import { OutboxRelayService } from './outbox-relay.service';

function buildService() {
  const prisma = { outboxEvent: { findMany: jest.fn(), update: jest.fn() } } as any;
  const producer = { publish: jest.fn() } as any;
  const service = new OutboxRelayService(prisma, producer);
  return { service, prisma, producer };
}

describe('OutboxRelayService', () => {
  it('publishes each pending event to auth-events keyed by aggregateId and marks it PUBLISHED', async () => {
    const { service, prisma, producer } = buildService();
    const createdAt = new Date('2026-07-09T10:00:00.000Z');
    prisma.outboxEvent.findMany.mockResolvedValue([
      {
        id: 'evt-1',
        aggregateType: 'User',
        aggregateId: 'user-1',
        eventType: 'UserRegistered',
        payload: { userId: 'user-1' },
        createdAt,
      },
    ]);
    producer.publish.mockResolvedValue(undefined);

    await service.relayPendingEvents();

    expect(producer.publish).toHaveBeenCalledWith('auth-events', [
      expect.objectContaining({
        key: 'user-1',
        value: expect.stringContaining('"eventType":"UserRegistered"'),
      }),
    ]);
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { status: 'PUBLISHED', publishedAt: expect.any(Date) },
    });
  });

  it('leaves the event PENDING and does not throw when the Kafka publish fails', async () => {
    const { service, prisma, producer } = buildService();
    prisma.outboxEvent.findMany.mockResolvedValue([
      {
        id: 'evt-1',
        aggregateType: 'User',
        aggregateId: 'user-1',
        eventType: 'UserRegistered',
        payload: {},
        createdAt: new Date(),
      },
    ]);
    producer.publish.mockRejectedValue(new Error('broker unreachable'));

    await expect(service.relayPendingEvents()).resolves.toBeUndefined();
    expect(prisma.outboxEvent.update).not.toHaveBeenCalled();
  });

  it('does nothing when there are no pending events', async () => {
    const { service, prisma, producer } = buildService();
    prisma.outboxEvent.findMany.mockResolvedValue([]);

    await service.relayPendingEvents();

    expect(producer.publish).not.toHaveBeenCalled();
  });
});
