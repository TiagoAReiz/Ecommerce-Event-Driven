import { InventoryEventsConsumer } from './inventory-events.consumer';

function buildConsumer() {
  const kafkaConsumer = { registerHandler: jest.fn() } as any;
  const eventService = {
    handleStockReserved: jest.fn(),
    handleStockReservationFailed: jest.fn(),
    handleStockReleased: jest.fn(),
  } as any;
  const consumer = new InventoryEventsConsumer(kafkaConsumer, eventService);
  return { consumer, kafkaConsumer, eventService };
}

function envelopeMessage(envelope: unknown) {
  return { topic: 'inventory-events', message: { value: Buffer.from(JSON.stringify(envelope)) } } as any;
}

describe('InventoryEventsConsumer', () => {
  it('registers its handler on the inventory-events topic during onModuleInit', async () => {
    const { consumer, kafkaConsumer } = buildConsumer();

    await consumer.onModuleInit();

    expect(kafkaConsumer.registerHandler).toHaveBeenCalledWith('inventory-events', expect.any(Function));
  });

  it('routes StockReserved to handleStockReserved with the eventId (inbox dedupe key)', async () => {
    const { consumer, eventService } = buildConsumer();
    const payload = { subOrderId: 'sub-1', orderId: 'order-1', reservations: [] };

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-1',
        eventType: 'StockReserved',
        aggregateType: 'StockReservation',
        aggregateId: 'sub-1',
        occurredAt: '2026-07-10T10:00:00.000Z',
        version: 1,
        payload,
      }),
    );

    expect(eventService.handleStockReserved).toHaveBeenCalledWith('evt-1', payload);
  });

  it('routes StockReservationFailed to handleStockReservationFailed', async () => {
    const { consumer, eventService } = buildConsumer();
    const payload = { subOrderId: 'sub-1', orderId: 'order-1', failedItems: [] };

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-2',
        eventType: 'StockReservationFailed',
        aggregateType: 'StockReservation',
        aggregateId: 'sub-1',
        occurredAt: '2026-07-10T10:00:00.000Z',
        version: 1,
        payload,
      }),
    );

    expect(eventService.handleStockReservationFailed).toHaveBeenCalledWith('evt-2', payload);
  });

  it('routes StockReleased to handleStockReleased', async () => {
    const { consumer, eventService } = buildConsumer();
    const payload = { subOrderId: 'sub-1', releasedItems: [], reason: 'EXPIRED' };

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-3',
        eventType: 'StockReleased',
        aggregateType: 'StockReservation',
        aggregateId: 'sub-1',
        occurredAt: '2026-07-10T10:00:00.000Z',
        version: 1,
        payload,
      }),
    );

    expect(eventService.handleStockReleased).toHaveBeenCalledWith('evt-3', payload);
  });

  it('ignores a malformed (unparseable) message without throwing', async () => {
    const { consumer, eventService } = buildConsumer();

    await consumer.handle({
      topic: 'inventory-events',
      message: { value: Buffer.from('not-json') },
    } as any);

    expect(eventService.handleStockReserved).not.toHaveBeenCalled();
    expect(eventService.handleStockReservationFailed).not.toHaveBeenCalled();
    expect(eventService.handleStockReleased).not.toHaveBeenCalled();
  });
});
