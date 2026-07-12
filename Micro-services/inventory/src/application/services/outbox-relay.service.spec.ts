import { OutboxRelayService } from './outbox-relay.service';
import { OutboxEvent } from '../../core/entities/outbox-event.entity';

function outboxEvent(overrides: Partial<ConstructorParameters<typeof OutboxEvent>[0]> = {}): OutboxEvent {
  return new OutboxEvent({
    id: 'evt-1',
    aggregateType: 'StockReservation',
    aggregateId: 'sub-1',
    eventType: 'StockReserved',
    payload: { subOrderId: 'sub-1' },
    createdAt: new Date('2026-07-11T09:00:00.000Z'),
    ...overrides,
  });
}

function buildService() {
  const outboxRepository = { findPending: jest.fn().mockResolvedValue([]), markPublished: jest.fn() } as any;
  const eventPublisher = { publish: jest.fn() } as any;
  const service = new OutboxRelayService(outboxRepository, eventPublisher);
  return { service, outboxRepository, eventPublisher };
}

describe('OutboxRelayService', () => {
  it('publishes each pending event to inventory-events keyed by aggregateId and marks it published', async () => {
    const { service, outboxRepository, eventPublisher } = buildService();
    outboxRepository.findPending.mockResolvedValue([outboxEvent()]);

    await service.relayPendingEvents();

    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    const [topic, key, value] = eventPublisher.publish.mock.calls[0];
    expect(topic).toBe('inventory-events');
    expect(key).toBe('sub-1');
    const envelope = JSON.parse(value);
    expect(envelope).toMatchObject({
      eventId: 'evt-1',
      eventType: 'StockReserved',
      aggregateType: 'StockReservation',
      aggregateId: 'sub-1',
      version: 1,
      payload: { subOrderId: 'sub-1' },
    });
    expect(outboxRepository.markPublished).toHaveBeenCalledWith('evt-1');
  });

  it('does not mark published when the publish fails', async () => {
    const { service, outboxRepository, eventPublisher } = buildService();
    outboxRepository.findPending.mockResolvedValue([outboxEvent()]);
    eventPublisher.publish.mockRejectedValue(new Error('broker down'));

    await service.relayPendingEvents();

    expect(outboxRepository.markPublished).not.toHaveBeenCalled();
  });
});
