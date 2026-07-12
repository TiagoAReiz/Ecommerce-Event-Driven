import { CatalogEventsConsumer } from './catalog-events.consumer';

function envelope(eventType: string, payload: unknown) {
  return {
    topic: 'catalog-events',
    message: {
      value: Buffer.from(
        JSON.stringify({
          eventId: 'evt-1',
          eventType,
          aggregateType: 'Seller',
          aggregateId: 'seller-1',
          occurredAt: new Date().toISOString(),
          version: 1,
          payload,
        }),
      ),
    },
  } as any;
}

function build() {
  const kafkaConsumer = { registerHandler: jest.fn() } as any;
  const sellerEventService = { handleSellerOnboarded: jest.fn() } as any;
  return {
    consumer: new CatalogEventsConsumer(kafkaConsumer, sellerEventService),
    kafkaConsumer,
    sellerEventService,
  };
}

describe('CatalogEventsConsumer', () => {
  it('registers a handler for the catalog-events topic on init', async () => {
    const { consumer, kafkaConsumer } = build();
    await consumer.onModuleInit();
    expect(kafkaConsumer.registerHandler).toHaveBeenCalledWith('catalog-events', expect.any(Function));
  });

  it('routes SellerOnboarded to the service with eventId + payload', async () => {
    const { consumer, sellerEventService } = build();
    const payload = { sellerId: 'seller-1', userId: 'user-1', storeName: 'L', document: 'd', mpCollectorId: 'mp' };

    await consumer.handle(envelope('SellerOnboarded', payload));

    expect(sellerEventService.handleSellerOnboarded).toHaveBeenCalledWith('evt-1', payload);
  });

  it('ignores other catalog event types', async () => {
    const { consumer, sellerEventService } = build();
    await consumer.handle(envelope('ProductCreated', { productId: 'p-1' }));
    expect(sellerEventService.handleSellerOnboarded).not.toHaveBeenCalled();
  });

  it('ignores malformed messages (unparseable value)', async () => {
    const { consumer, sellerEventService } = build();
    await consumer.handle({ topic: 'catalog-events', message: { value: Buffer.from('not json') } } as any);
    expect(sellerEventService.handleSellerOnboarded).not.toHaveBeenCalled();
  });
});
