import { ReviewEventsConsumer } from './review-events.consumer';

function buildConsumer() {
  const kafkaConsumer = { registerHandler: jest.fn() } as any;
  const eventService = { handleReviewSent: jest.fn() } as any;
  const consumer = new ReviewEventsConsumer(kafkaConsumer, eventService);
  return { consumer, kafkaConsumer, eventService };
}

function envelopeMessage(envelope: unknown) {
  return { topic: 'review-events', message: { value: Buffer.from(JSON.stringify(envelope)) } } as any;
}

describe('ReviewEventsConsumer', () => {
  it('registers its handler on the review-events topic during onModuleInit', async () => {
    const { consumer, kafkaConsumer } = buildConsumer();

    await consumer.onModuleInit();

    expect(kafkaConsumer.registerHandler).toHaveBeenCalledWith('review-events', expect.any(Function));
  });

  it('routes ReviewSent to handleReviewSent', async () => {
    const { consumer, eventService } = buildConsumer();
    const payload = {
      reviewId: 'review-1',
      customerId: 'customer-1',
      productId: 'prod-1',
      sellerId: 'seller-1',
      grade: 5,
      comment: 'Ótimo!',
      orderId: 'order-1',
    };

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-1',
        eventType: 'ReviewSent',
        aggregateType: 'Review',
        aggregateId: 'review-1',
        occurredAt: '2026-07-22T10:00:00.000Z',
        version: 1,
        payload,
      }),
    );

    expect(eventService.handleReviewSent).toHaveBeenCalledWith('evt-1', payload);
  });

  it('silently ignores an unknown eventType', async () => {
    const { consumer, eventService } = buildConsumer();

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-2',
        eventType: 'SomethingElse',
        aggregateType: 'Review',
        aggregateId: 'review-1',
        occurredAt: '2026-07-22T10:00:00.000Z',
        version: 1,
        payload: {},
      }),
    );

    expect(eventService.handleReviewSent).not.toHaveBeenCalled();
  });
});
