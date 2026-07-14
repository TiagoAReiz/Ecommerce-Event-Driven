import { ReviewService } from "./review-service";

function build() {
    const reviewRepository = { save: jest.fn(), findByProductId: jest.fn() };
    const service = new ReviewService(reviewRepository as any);
    return { service, reviewRepository };
}

describe('ReviewService', () => {
    describe('sendReview', () => {
        it('should send a review', async () => {
            const { service, reviewRepository } = build();
            const review = { grade: 5, comment: 'Great product', customerId: '1', orderId: '1', productId: '1' };
            await service.sendReview(review);
            expect(reviewRepository.save).toHaveBeenCalledWith(review);
        });
    });

    describe('getReviewsByProductId', () => {
        it('should return the reviews for a product', async () => {
            const { service, reviewRepository } = build();
            const reviews = [{ id: '1', grade: 5, comment: 'Great product', customerId: '1', orderId: '1', productId: '1' }];
            reviewRepository.findByProductId.mockResolvedValue(reviews);

            const result = await service.getReviewsByProductId('1');

            expect(reviewRepository.findByProductId).toHaveBeenCalledWith('1');
            expect(result).toBe(reviews);
        });
    });
});