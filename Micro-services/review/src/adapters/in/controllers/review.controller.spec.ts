import { Test, TestingModule } from '@nestjs/testing';
import { ReviewController } from './review.controller';
import { ReviewService } from '../../../application/services/review-service';

function build() {
  const service = { sendReview: jest.fn() };

  return { service, controller: new ReviewController(service as any) };
}
describe('ReviewController', () => {
  it('should send a review', async () => {
    const { controller, service } = build();
    const review = { grade: 5, comment: 'Great product', customerId: '1', orderId: '1', productId: '1' };
    await service.sendReview(review);
    expect(service.sendReview).toHaveBeenCalledWith(review);
  });
});
