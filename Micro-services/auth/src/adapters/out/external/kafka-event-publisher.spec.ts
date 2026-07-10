import { KafkaEventPublisher } from './kafka-event-publisher';

describe('KafkaEventPublisher', () => {
  it('delegates to KafkaProducerService with a single keyed message', async () => {
    const producer = { publish: jest.fn().mockResolvedValue(undefined) } as any;
    const publisher = new KafkaEventPublisher(producer);

    await publisher.publish('auth-events', 'user-1', '{"eventType":"UserRegistered"}');

    expect(producer.publish).toHaveBeenCalledWith('auth-events', [
      { key: 'user-1', value: '{"eventType":"UserRegistered"}' },
    ]);
  });
});
