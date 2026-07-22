import { ReviewService } from './review-service';
import { ProductNotPurchasedException } from '../../core/exceptions/product-not-purchased.exception';

function build() {
  const reviewRepository = {
    save: jest.fn(),
    findByProductId: jest.fn(),
    findByCustomerAndProduct: jest.fn(),
    update: jest.fn(),
  };
  const orderClient = { verifyPurchase: jest.fn() };
  const service = new ReviewService(reviewRepository as any, orderClient as any);
  return { service, reviewRepository, orderClient };
}

describe('ReviewService', () => {
  describe('sendReview', () => {
    it('throws ProductNotPurchasedException and saves nothing when not eligible', async () => {
      const { service, reviewRepository, orderClient } = build();
      orderClient.verifyPurchase.mockResolvedValue({ eligible: false });

      await expect(
        service.sendReview('customer-1', 'token-1', {
          grade: 5,
          comment: 'Great product',
          orderId: 'order-1',
          productId: 'prod-1',
        } as any),
      ).rejects.toThrow(ProductNotPurchasedException);
      expect(reviewRepository.save).not.toHaveBeenCalled();
      expect(reviewRepository.update).not.toHaveBeenCalled();
    });

    it('creates a new review (with sellerId from the eligibility check) when none exists yet for this customer+product', async () => {
      const { service, reviewRepository, orderClient } = build();
      orderClient.verifyPurchase.mockResolvedValue({ eligible: true, sellerId: 'seller-1' });
      reviewRepository.findByCustomerAndProduct.mockResolvedValue(null);

      await service.sendReview('customer-1', 'token-1', {
        grade: 5,
        comment: 'Great product',
        orderId: 'order-1',
        productId: 'prod-1',
      } as any);

      expect(orderClient.verifyPurchase).toHaveBeenCalledWith('token-1', 'order-1', 'prod-1');
      expect(reviewRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          grade: 5,
          comment: 'Great product',
          customerId: 'customer-1',
          orderId: 'order-1',
          productId: 'prod-1',
        }),
        'seller-1',
      );
      expect(reviewRepository.update).not.toHaveBeenCalled();
    });

    it('updates the existing review (no outbox event) when the customer already reviewed this product', async () => {
      const { service, reviewRepository, orderClient } = build();
      orderClient.verifyPurchase.mockResolvedValue({ eligible: true, sellerId: 'seller-1' });
      reviewRepository.findByCustomerAndProduct.mockResolvedValue({
        id: 'review-existing',
        grade: 3,
        comment: 'old comment',
        customerId: 'customer-1',
        orderId: 'order-1',
        productId: 'prod-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.sendReview('customer-1', 'token-1', {
        grade: 4,
        comment: 'updated comment',
        orderId: 'order-1',
        productId: 'prod-1',
      } as any);

      expect(reviewRepository.update).toHaveBeenCalledWith(
        'review-existing',
        expect.objectContaining({ grade: 4, comment: 'updated comment', customerId: 'customer-1' }),
      );
      expect(reviewRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('getReviewsByProductId', () => {
    it('returns the reviews for a product', async () => {
      const { service, reviewRepository } = build();
      const reviews = [{ id: '1', grade: 5, comment: 'Great product', customerId: '1', orderId: '1', productId: '1' }];
      reviewRepository.findByProductId.mockResolvedValue(reviews);

      const result = await service.getReviewsByProductId('1');

      expect(reviewRepository.findByProductId).toHaveBeenCalledWith('1');
      expect(result).toBe(reviews);
    });
  });
});
