import { OrderEventsConsumer } from './order-events.consumer';

function message(envelope: unknown) {
  return {
    topic: 'order-events',
    partition: 0,
    message: { value: Buffer.from(JSON.stringify(envelope)) },
  } as any;
}

function build() {
  const kafkaConsumer = { registerHandler: jest.fn() };
  const eventService = {
    handleOrderReadyForPayment: jest.fn(),
    handleOrderCancelled: jest.fn(),
    handleSellerOnboarded: jest.fn(),
  };
  const consumer = new OrderEventsConsumer(kafkaConsumer as any, eventService as any);
  return { consumer, kafkaConsumer, eventService };
}

describe('OrderEventsConsumer', () => {
  it('registers itself on the order-events topic on init', async () => {
    const { consumer, kafkaConsumer } = build();
    await consumer.onModuleInit();
    expect(kafkaConsumer.registerHandler).toHaveBeenCalledWith('order-events', expect.any(Function));
  });

  it('routes OrderReadyForPayment to the event service with eventId + payload', async () => {
    const { consumer, eventService } = build();
    await consumer.handle(
      message({ eventId: 'evt-1', eventType: 'OrderReadyForPayment', payload: { orderId: 'order-1' } }),
    );
    expect(eventService.handleOrderReadyForPayment).toHaveBeenCalledWith('evt-1', { orderId: 'order-1' });
  });

  it('routes OrderCancelled to the event service', async () => {
    const { consumer, eventService } = build();
    await consumer.handle(
      message({ eventId: 'evt-2', eventType: 'OrderCancelled', payload: { orderId: 'order-1' } }),
    );
    expect(eventService.handleOrderCancelled).toHaveBeenCalledWith('evt-2', { orderId: 'order-1' });
  });

  it('silently ignores unrelated event types (e.g. OrderCreated)', async () => {
    const { consumer, eventService } = build();
    await consumer.handle(message({ eventId: 'evt-3', eventType: 'OrderCreated', payload: {} }));
    expect(eventService.handleOrderReadyForPayment).not.toHaveBeenCalled();
    expect(eventService.handleOrderCancelled).not.toHaveBeenCalled();
  });

  it('ignores a malformed message (unparseable envelope)', async () => {
    const { consumer, eventService } = build();
    await consumer.handle({ topic: 'order-events', message: { value: Buffer.from('not json') } } as any);
    expect(eventService.handleOrderReadyForPayment).not.toHaveBeenCalled();
  });
});
