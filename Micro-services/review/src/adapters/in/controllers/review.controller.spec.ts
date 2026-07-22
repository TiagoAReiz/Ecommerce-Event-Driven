import { ReviewController } from './review.controller';

function build() {
  const service = { sendReview: jest.fn(), getReviewsByProductId: jest.fn() };
  return { service, controller: new ReviewController(service as any) };
}

function requestWith(userId: string, bearer = 'token-1') {
  return {
    user: { sub: userId },
    headers: { authorization: `Bearer ${bearer}` },
  } as any;
}

describe('ReviewController', () => {
  describe('sendReview', () => {
    it('derives customerId from the JWT and forwards the bearer token to the service', async () => {
      const { controller, service } = build();
      const review = { grade: 5, comment: 'Great product', orderId: 'order-1', productId: 'prod-1' };

      await controller.sendReview(requestWith('customer-1', 'token-1'), review as any);

      expect(service.sendReview).toHaveBeenCalledWith('customer-1', 'token-1', review);
    });
  });

  describe('getByProductId', () => {
    it('returns the mapped reviews for the product', async () => {
      const { controller, service } = build();
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const updatedAt = new Date('2026-01-01T00:00:00.000Z');
      service.getReviewsByProductId.mockResolvedValue([
        { id: '1', grade: 5, comment: 'Great product', customerId: '1', orderId: '1', productId: '1', createdAt, updatedAt },
      ]);

      const result = await controller.getByProductId('1');

      expect(service.getReviewsByProductId).toHaveBeenCalledWith('1');
      expect(result).toEqual([
        { id: '1', grade: 5, comment: 'Great product', customerId: '1', orderId: '1', productId: '1', createdAt, updatedAt },
      ]);
    });
  });
});
