// The concrete PrismaService transitively imports the Prisma-7 generated client
// (generated/prisma/client.ts), which is emitted as ESM (`import.meta.url`) and
// cannot be loaded under ts-jest's CommonJS transform. This test never exercises
// the real PrismaService (a fake `prisma` object is injected below), so the
// import is mocked purely to keep it from being loaded at all.
jest.mock('src/adapters/out/database/prisma.service', () => ({ PrismaService: class {} }));

import { ReviewRepository } from './review-repository';

function buildTx() {
  return {
    review: { create: jest.fn(), update: jest.fn() },
    outboxEvent: { create: jest.fn() },
  };
}

function buildRepo() {
  const tx = buildTx();
  const prisma = {
    $transaction: jest.fn((cb: any) => cb(tx)),
    review: { findMany: jest.fn(), findFirst: jest.fn() },
  } as any;
  return { repo: new ReviewRepository(prisma), prisma, tx };
}

describe('ReviewRepository.save', () => {
  it('creates the Review and an OutboxEvent(ReviewSent) in the same transaction', async () => {
    const { repo, tx } = buildRepo();
    const input = {
      id: 'review-1',
      grade: 5,
      comment: 'Great product',
      customerId: 'customer-1',
      orderId: 'order-1',
      productId: 'prod-1',
    };

    await repo.save(input, 'seller-1');

    expect(tx.review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'review-1',
          grade: 5,
          comment: 'Great product',
          customerId: 'customer-1',
          orderId: 'order-1',
          productId: 'prod-1',
        }),
      }),
    );
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        aggregateType: 'Review',
        aggregateId: 'review-1',
        eventType: 'ReviewSent',
        payload: {
          reviewId: 'review-1',
          customerId: 'customer-1',
          productId: 'prod-1',
          sellerId: 'seller-1',
          grade: 5,
          comment: 'Great product',
          orderId: 'order-1',
        },
      },
    });
  });
});
