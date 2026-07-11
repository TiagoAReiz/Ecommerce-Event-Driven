import { OutboxRelayService } from './outbox-relay.service';
import { OutboxEvent } from '../../core/entities/outbox-event.entity';

function buildService() {
  const outboxRepository = { findPending: jest.fn(), markPublished: jest.fn() } as any;
  const eventPublisher = { publish: jest.fn() } as any;
  const service = new OutboxRelayService(outboxRepository, eventPublisher);
  return { service, outboxRepository, eventPublisher };
}

function makeEvent(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return new OutboxEvent({
    id: 'evt-1',
    aggregateType: 'FreightQuote',
    aggregateId: 'sub-1',
    eventType: 'FreightQuoted',
    payload: { subOrderId: 'sub-1' },
    createdAt: new Date('2026-07-10T10:00:00.000Z'),
    ...overrides,
  });
}

describe('OutboxRelayService', () => {
  it('publishes each pending event to shipping-events keyed by aggregateId (subOrderId) and marks it published', async () => {
    const { service, outboxRepository, eventPublisher } = buildService();
    outboxRepository.findPending.mockResolvedValue([makeEvent()]);
    eventPublisher.publish.mockResolvedValue(undefined);

    await service.relayPendingEvents();

    expect(outboxRepository.findPending).toHaveBeenCalledWith(20);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'shipping-events',
      'sub-1',
      expect.stringContaining('"eventType":"FreightQuoted"'),
    );
    expect(outboxRepository.markPublished).toHaveBeenCalledWith('evt-1');
  });

  it('leaves the event pending and does not throw when the publish fails', async () => {
    const { service, outboxRepository, eventPublisher } = buildService();
    outboxRepository.findPending.mockResolvedValue([makeEvent()]);
    eventPublisher.publish.mockRejectedValue(new Error('broker unreachable'));

    await expect(service.relayPendingEvents()).resolves.toBeUndefined();
    expect(outboxRepository.markPublished).not.toHaveBeenCalled();
  });

  it('does nothing when there are no pending events', async () => {
    const { service, outboxRepository, eventPublisher } = buildService();
    outboxRepository.findPending.mockResolvedValue([]);

    await service.relayPendingEvents();

    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it("uses the outbox event's own id as the envelope eventId", async () => {
    const { service, outboxRepository, eventPublisher } = buildService();
    outboxRepository.findPending.mockResolvedValue([makeEvent({ id: 'evt-stable-id' })]);
    eventPublisher.publish.mockResolvedValue(undefined);

    await service.relayPendingEvents();

    const [, , value] = eventPublisher.publish.mock.calls[0];
    expect(JSON.parse(value).eventId).toBe('evt-stable-id');
  });

  it('does not start a second poll while a previous one is still in flight', async () => {
    const { service, outboxRepository, eventPublisher } = buildService();
    let resolvePublish: () => void = () => {};
    const publishPromise = new Promise<void>((resolve) => (resolvePublish = resolve));
    outboxRepository.findPending.mockResolvedValue([makeEvent()]);
    eventPublisher.publish.mockReturnValue(publishPromise);

    const firstCall = service.relayPendingEvents();
    const secondCall = service.relayPendingEvents();
    resolvePublish();
    await Promise.all([firstCall, secondCall]);

    expect(outboxRepository.findPending).toHaveBeenCalledTimes(1);
  });
});
