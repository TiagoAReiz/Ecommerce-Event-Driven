import { OrderEventsConsumer } from './order-events.consumer';

function buildConsumer() {
  const kafkaConsumer = { registerHandler: jest.fn() } as any;
  const eventService = { handleOrderCreated: jest.fn(), handleOrderCancelled: jest.fn() } as any;
  const consumer = new OrderEventsConsumer(kafkaConsumer, eventService);
  return { consumer, kafkaConsumer, eventService };
}

function envelopeMessage(envelope: unknown) {
  return { topic: 'order-events', message: { value: Buffer.from(JSON.stringify(envelope)) } } as any;
}

describe('OrderEventsConsumer', () => {
  it('registers its handler on the order-events topic during onModuleInit', async () => {
    const { consumer, kafkaConsumer } = buildConsumer();

    await consumer.onModuleInit();

    expect(kafkaConsumer.registerHandler).toHaveBeenCalledWith('order-events', expect.any(Function));
  });

  it('routes OrderCreated to handleOrderCreated', async () => {
    const { consumer, eventService } = buildConsumer();
    const payload = { orderId: 'order-1', userId: 'user-1', addressId: 'addr-1', subOrders: [] };

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-1',
        eventType: 'OrderCreated',
        aggregateType: 'Order',
        aggregateId: 'order-1',
        occurredAt: '2026-07-10T10:00:00.000Z',
        version: 1,
        payload,
      }),
    );

    expect(eventService.handleOrderCreated).toHaveBeenCalledWith('evt-1', payload);
  });

  it('routes OrderCancelled to handleOrderCancelled', async () => {
    const { consumer, eventService } = buildConsumer();
    const payload = {
      orderId: 'order-1',
      userId: 'user-1',
      subOrderIds: ['sub-1'],
      cancelReason: 'changed my mind',
      initiatedBy: 'CUSTOMER',
    };

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-2',
        eventType: 'OrderCancelled',
        aggregateType: 'Order',
        aggregateId: 'order-1',
        occurredAt: '2026-07-10T10:00:00.000Z',
        version: 1,
        payload,
      }),
    );

    expect(eventService.handleOrderCancelled).toHaveBeenCalledWith('evt-2', payload);
  });

  it('silently ignores OrderReadyForPayment (not consumed by notification)', async () => {
    const { consumer, eventService } = buildConsumer();

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-3',
        eventType: 'OrderReadyForPayment',
        aggregateType: 'Order',
        aggregateId: 'order-1',
        occurredAt: '2026-07-10T10:00:00.000Z',
        version: 1,
        payload: {},
      }),
    );

    expect(eventService.handleOrderCreated).not.toHaveBeenCalled();
    expect(eventService.handleOrderCancelled).not.toHaveBeenCalled();
  });
});
