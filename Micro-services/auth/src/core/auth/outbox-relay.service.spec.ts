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

  it("uses the outbox event's own id as the envelope eventId, not a freshly generated one", async () => {
    const { service, prisma, producer } = buildService();
    prisma.outboxEvent.findMany.mockResolvedValue([
      {
        id: 'evt-stable-id',
        aggregateType: 'User',
        aggregateId: 'user-1',
        eventType: 'UserRegistered',
        payload: {},
        createdAt: new Date(),
      },
    ]);
    producer.publish.mockResolvedValue(undefined);

    await service.relayPendingEvents();

    const [, messages] = producer.publish.mock.calls[0];
    const envelope = JSON.parse(messages[0].value);
    expect(envelope.eventId).toBe('evt-stable-id');
  });

  it('does not start a second poll while a previous one is still in flight', async () => {
    const { service, prisma, producer } = buildService();
    let resolvePublish: () => void = () => {};
    const publishPromise = new Promise<void>((resolve) => {
      resolvePublish = resolve;
    });

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
    producer.publish.mockReturnValue(publishPromise);

    const firstCall = service.relayPendingEvents();
    const secondCall = service.relayPendingEvents();

    resolvePublish();
    await Promise.all([firstCall, secondCall]);

    expect(prisma.outboxEvent.findMany).toHaveBeenCalledTimes(1);
  });
});
