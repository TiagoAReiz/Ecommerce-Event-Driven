import { OutboxRelayService } from './outbox-relay.service';
import { OutboxEvent } from '../../core/entities/outbox-event.entity';

function build() {
  const outboxRepository = { findPending: jest.fn(), markPublished: jest.fn() };
  const eventPublisher = { publish: jest.fn() };
  const service = new OutboxRelayService(outboxRepository as any, eventPublisher as any);
  return { service, outboxRepository, eventPublisher };
}

describe('OutboxRelayService', () => {
  it('publishes each pending event to payment-events keyed by aggregateId (orderId) and marks it published', async () => {
    const { service, outboxRepository, eventPublisher } = build();
    const event = new OutboxEvent({
      id: 'evt-1',
      aggregateType: 'Payment',
      aggregateId: 'order-1',
      eventType: 'PaymentConfirmed',
      payload: { paymentId: 'pay-1' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    outboxRepository.findPending.mockResolvedValue([event]);

    await service.relayPendingEvents();

    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    const [topic, key, value] = eventPublisher.publish.mock.calls[0];
    expect(topic).toBe('payment-events');
    expect(key).toBe('order-1');
    const envelope = JSON.parse(value);
    expect(envelope).toMatchObject({
      eventId: 'evt-1',
      eventType: 'PaymentConfirmed',
      aggregateType: 'Payment',
      aggregateId: 'order-1',
      version: 1,
      payload: { paymentId: 'pay-1' },
    });
    expect(outboxRepository.markPublished).toHaveBeenCalledWith('evt-1');
  });

  it('does not mark published when publishing throws', async () => {
    const { service, outboxRepository, eventPublisher } = build();
    outboxRepository.findPending.mockResolvedValue([
      new OutboxEvent({
        id: 'evt-1',
        aggregateType: 'Payment',
        aggregateId: 'order-1',
        eventType: 'PaymentFailed',
        payload: {},
        createdAt: new Date(),
      }),
    ]);
    eventPublisher.publish.mockRejectedValue(new Error('broker down'));

    await service.relayPendingEvents();

    expect(outboxRepository.markPublished).not.toHaveBeenCalled();
  });

  it('does not run concurrently with itself (re-entrancy guard)', async () => {
    const { service, outboxRepository } = build();
    let resolveFind: (v: unknown) => void = () => {};
    outboxRepository.findPending.mockImplementation(
      () => new Promise((resolve) => (resolveFind = resolve)),
    );

    const first = service.relayPendingEvents();
    await service.relayPendingEvents(); // returns immediately, guard is set
    expect(outboxRepository.findPending).toHaveBeenCalledTimes(1);

    resolveFind([]);
    await first;
  });
});
