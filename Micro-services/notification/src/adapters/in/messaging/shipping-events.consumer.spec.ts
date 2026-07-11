import { ShippingEventsConsumer } from './shipping-events.consumer';

function buildConsumer() {
  const kafkaConsumer = { registerHandler: jest.fn() } as any;
  const eventService = { handleShipmentDispatched: jest.fn(), handleShipmentDelivered: jest.fn() } as any;
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

  it('routes ShipmentDispatched to handleShipmentDispatched', async () => {
    const { consumer, eventService } = buildConsumer();
    const payload = {
      subOrderId: 'sub-1',
      orderId: 'order-1',
      userId: 'user-1',
      trackingCode: 'TRACK123',
      carrier: 'Correios',
      estimatedDeliveryDate: '2026-08-01',
    };

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-1',
        eventType: 'ShipmentDispatched',
        aggregateType: 'Shipment',
        aggregateId: 'sub-1',
        occurredAt: '2026-07-10T10:00:00.000Z',
        version: 1,
        payload,
      }),
    );

    expect(eventService.handleShipmentDispatched).toHaveBeenCalledWith('evt-1', payload);
  });

  it('routes ShipmentDelivered to handleShipmentDelivered', async () => {
    const { consumer, eventService } = buildConsumer();
    const payload = { subOrderId: 'sub-1', orderId: 'order-1', userId: 'user-1', deliveredAt: '2026-08-05' };

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-2',
        eventType: 'ShipmentDelivered',
        aggregateType: 'Shipment',
        aggregateId: 'sub-1',
        occurredAt: '2026-07-10T10:00:00.000Z',
        version: 1,
        payload,
      }),
    );

    expect(eventService.handleShipmentDelivered).toHaveBeenCalledWith('evt-2', payload);
  });

  it('silently ignores FreightQuoted/FreightQuoteFailed (not consumed by notification)', async () => {
    const { consumer, eventService } = buildConsumer();

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-3',
        eventType: 'FreightQuoted',
        aggregateType: 'Shipment',
        aggregateId: 'sub-1',
        occurredAt: '2026-07-10T10:00:00.000Z',
        version: 1,
        payload: {},
      }),
    );

    expect(eventService.handleShipmentDispatched).not.toHaveBeenCalled();
    expect(eventService.handleShipmentDelivered).not.toHaveBeenCalled();
  });
});
