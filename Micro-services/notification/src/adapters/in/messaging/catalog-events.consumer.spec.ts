import { CatalogEventsConsumer } from './catalog-events.consumer';

function buildConsumer() {
  const kafkaConsumer = { registerHandler: jest.fn() } as any;
  const eventService = { handleSellerOnboarded: jest.fn() } as any;
  const consumer = new CatalogEventsConsumer(kafkaConsumer, eventService);
  return { consumer, kafkaConsumer, eventService };
}

function envelopeMessage(envelope: unknown) {
  return { topic: 'catalog-events', message: { value: Buffer.from(JSON.stringify(envelope)) } } as any;
}

describe('CatalogEventsConsumer', () => {
  it('registers its handler on the catalog-events topic during onModuleInit', async () => {
    const { consumer, kafkaConsumer } = buildConsumer();

    await consumer.onModuleInit();

    expect(kafkaConsumer.registerHandler).toHaveBeenCalledWith('catalog-events', expect.any(Function));
  });

  it('routes SellerOnboarded to handleSellerOnboarded', async () => {
    const { consumer, eventService } = buildConsumer();
    const payload = { sellerId: 'seller-1', userId: 'user-1', storeName: 'Loja X', document: '123', mpCollectorId: 'mp-1' };

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-1',
        eventType: 'SellerOnboarded',
        aggregateType: 'Seller',
        aggregateId: 'seller-1',
        occurredAt: '2026-07-22T10:00:00.000Z',
        version: 1,
        payload,
      }),
    );

    expect(eventService.handleSellerOnboarded).toHaveBeenCalledWith('evt-1', payload);
  });

  it('silently ignores an unknown eventType', async () => {
    const { consumer, eventService } = buildConsumer();

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-2',
        eventType: 'ProductCreated',
        aggregateType: 'Product',
        aggregateId: 'prod-1',
        occurredAt: '2026-07-22T10:00:00.000Z',
        version: 1,
        payload: {},
      }),
    );

    expect(eventService.handleSellerOnboarded).not.toHaveBeenCalled();
  });
});
