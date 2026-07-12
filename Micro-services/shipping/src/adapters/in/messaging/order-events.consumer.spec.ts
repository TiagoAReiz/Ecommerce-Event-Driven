import { KafkaJS } from '@confluentinc/kafka-javascript';
import { OrderEventsConsumer } from './order-events.consumer';

function fakeMessage(topic: string, envelope: unknown): KafkaJS.EachMessagePayload {
  return {
    topic,
    partition: 0,
    message: { value: Buffer.from(JSON.stringify(envelope)) },
  } as unknown as KafkaJS.EachMessagePayload;
}

function buildConsumer() {
  const kafkaConsumer = { registerHandler: jest.fn() } as any;
  const eventService = {
    handleOrderCreated: jest.fn().mockResolvedValue(undefined),
    handlePaymentConfirmed: jest.fn(),
  } as any;
  const consumer = new OrderEventsConsumer(kafkaConsumer, eventService);
  return { consumer, eventService };
}

describe('OrderEventsConsumer', () => {
  it('routes OrderCreated to handleOrderCreated with the eventId and payload', async () => {
    const { consumer, eventService } = buildConsumer();
    const envelope = {
      eventId: 'evt-1',
      eventType: 'OrderCreated',
      aggregateType: 'Order',
      aggregateId: 'order-1',
      occurredAt: new Date().toISOString(),
      version: 1,
      payload: { orderId: 'order-1', userId: 'user-1', addressId: 'addr-1', subOrders: [] },
    };
    await consumer.handle(fakeMessage('order-events', envelope));
    expect(eventService.handleOrderCreated).toHaveBeenCalledWith('evt-1', envelope.payload);
  });

  it('ignores unrelated order events (OrderReadyForPayment, OrderCancelled)', async () => {
    const { consumer, eventService } = buildConsumer();
    for (const eventType of ['OrderReadyForPayment', 'OrderCancelled']) {
      await consumer.handle(
        fakeMessage('order-events', { eventId: 'e', eventType, payload: {} }),
      );
    }
    expect(eventService.handleOrderCreated).not.toHaveBeenCalled();
  });

  it('ignores malformed messages without throwing', async () => {
    const { consumer, eventService } = buildConsumer();
    const bad = { topic: 'order-events', partition: 0, message: { value: Buffer.from('not json') } };
    await expect(consumer.handle(bad as any)).resolves.toBeUndefined();
    expect(eventService.handleOrderCreated).not.toHaveBeenCalled();
  });
});
