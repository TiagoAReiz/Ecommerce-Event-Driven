import { ShippingEventsConsumer } from './shipping-events.consumer';

function buildConsumer() {
  const kafkaConsumer = { registerHandler: jest.fn() } as any;
  const eventService = {
    handleFreightQuoted: jest.fn(),
    handleFreightQuoteFailed: jest.fn(),
    handleShipmentDispatched: jest.fn(),
    handleShipmentDelivered: jest.fn(),
  } as any;
  const consumer = new ShippingEventsConsumer(kafkaConsumer, eventService);
  return { consumer, kafkaConsumer, eventService };
}

function envelopeMessage(envelope: unknown) {
  return { topic: 'shipping-events', message: { value: Buffer.from(JSON.stringify(envelope)) } } as any;
}

describe('ShippingEventsConsumer', () => {
  it('registers its handler on the shipping-events topic during onModuleInit', async () => {
    const { consumer, kafkaConsumer } = buildConsumer();

    await consumer.onModuleInit();

    expect(kafkaConsumer.registerHandler).toHaveBeenCalledWith('shipping-events', expect.any(Function));
  });

  it('routes FreightQuoted to handleFreightQuoted', async () => {
    const { consumer, eventService } = buildConsumer();
    const payload = { subOrderId: 'sub-1', orderId: 'order-1', carrier: 'Correios', price: '15.00', estimatedDays: 5 };

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-1',
        eventType: 'FreightQuoted',
        aggregateType: 'FreightQuote',
        aggregateId: 'sub-1',
        occurredAt: '2026-07-10T10:00:00.000Z',
        version: 1,
        payload,
      }),
    );

    expect(eventService.handleFreightQuoted).toHaveBeenCalledWith('evt-1', payload);
  });

  it('routes FreightQuoteFailed to handleFreightQuoteFailed', async () => {
    const { consumer, eventService } = buildConsumer();
    const payload = { subOrderId: 'sub-1', orderId: 'order-1', reason: 'no carrier available' };

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-2',
        eventType: 'FreightQuoteFailed',
        aggregateType: 'FreightQuote',
        aggregateId: 'sub-1',
        occurredAt: '2026-07-10T10:00:00.000Z',
        version: 1,
        payload,
      }),
    );

    expect(eventService.handleFreightQuoteFailed).toHaveBeenCalledWith('evt-2', payload);
  });

  it('routes ShipmentDispatched and ShipmentDelivered to their handlers', async () => {
    const { consumer, eventService } = buildConsumer();
    const dispatchedPayload = {
      subOrderId: 'sub-1',
      orderId: 'order-1',
      userId: 'user-1',
      trackingCode: 'BR123',
      carrier: 'Correios',
      estimatedDeliveryDate: '2026-08-01',
    };
    const deliveredPayload = { subOrderId: 'sub-1', orderId: 'order-1', userId: 'user-1', deliveredAt: '2026-08-05' };

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-3',
        eventType: 'ShipmentDispatched',
        aggregateType: 'Shipment',
        aggregateId: 'sub-1',
        occurredAt: '2026-07-10T10:00:00.000Z',
        version: 1,
        payload: dispatchedPayload,
      }),
    );
    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-4',
        eventType: 'ShipmentDelivered',
        aggregateType: 'Shipment',
        aggregateId: 'sub-1',
        occurredAt: '2026-07-10T10:00:00.000Z',
        version: 1,
        payload: deliveredPayload,
      }),
    );

    expect(eventService.handleShipmentDispatched).toHaveBeenCalledWith('evt-3', dispatchedPayload);
    expect(eventService.handleShipmentDelivered).toHaveBeenCalledWith('evt-4', deliveredPayload);
  });

  it('ignores a malformed (unparseable) message without throwing', async () => {
    const { consumer, eventService } = buildConsumer();

    await consumer.handle({
      topic: 'shipping-events',
      message: { value: Buffer.from('not-json') },
    } as any);

    expect(eventService.handleFreightQuoted).not.toHaveBeenCalled();
    expect(eventService.handleFreightQuoteFailed).not.toHaveBeenCalled();
  });
});
