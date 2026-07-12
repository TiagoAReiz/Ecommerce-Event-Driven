import { CatalogEventsConsumer } from './catalog-events.consumer';

function message(envelope: unknown) {
  return {
    topic: 'catalog-events',
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
  const consumer = new CatalogEventsConsumer(kafkaConsumer as any, eventService as any);
  return { consumer, kafkaConsumer, eventService };
}

describe('CatalogEventsConsumer', () => {
  it('registers itself on the catalog-events topic on init', async () => {
    const { consumer, kafkaConsumer } = build();
    await consumer.onModuleInit();
    expect(kafkaConsumer.registerHandler).toHaveBeenCalledWith('catalog-events', expect.any(Function));
  });

  it('routes SellerOnboarded to the event service', async () => {
    const { consumer, eventService } = build();
    await consumer.handle(
      message({
        eventId: 'evt-1',
        eventType: 'SellerOnboarded',
        payload: { sellerId: 'seller-1', userId: 'user-1', mpCollectorId: 'mp-1' },
      }),
    );
    expect(eventService.handleSellerOnboarded).toHaveBeenCalledWith('evt-1', {
      sellerId: 'seller-1',
      userId: 'user-1',
      mpCollectorId: 'mp-1',
    });
  });

  it('ignores other catalog events (e.g. ProductCreated)', async () => {
    const { consumer, eventService } = build();
    await consumer.handle(message({ eventId: 'evt-2', eventType: 'ProductCreated', payload: {} }));
    expect(eventService.handleSellerOnboarded).not.toHaveBeenCalled();
  });
});
