import { Test, TestingModule } from '@nestjs/testing';
import { ReviewController } from './review.controller';
import { ReviewService } from '../../../application/services/review-service';

function build() {
  const service = { sendReview: jest.fn(), getReviewsByProductId: jest.fn() };

  return { service, controller: new ReviewController(service as any) };
}
describe('ReviewController', () => {
  it('should send a review', async () => {
    const { controller, service } = build();
    const review = { grade: 5, comment: 'Great product', customerId: '1', orderId: '1', productId: '1' };
    await service.sendReview(review);
    expect(service.sendReview).toHaveBeenCalledWith(review);
  });

  describe('getByProductId', () => {
    it('should return the mapped reviews for the product', async () => {
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
