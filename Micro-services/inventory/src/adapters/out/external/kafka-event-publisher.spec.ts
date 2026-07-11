import { KafkaEventPublisher } from './kafka-event-publisher';

describe('KafkaEventPublisher', () => {
  it('publishes a single keyed message to the given topic', async () => {
    const producer = { publish: jest.fn() } as any;
    const publisher = new KafkaEventPublisher(producer);

    await publisher.publish('inventory-events', 'sub-1', '{"eventType":"StockReserved"}');

    expect(producer.publish).toHaveBeenCalledWith('inventory-events', [
      { key: 'sub-1', value: '{"eventType":"StockReserved"}' },
    ]);
  });
});
