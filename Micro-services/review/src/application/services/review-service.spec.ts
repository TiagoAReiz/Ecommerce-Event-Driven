import { ReviewService } from "./review-service";

function build() {
    const reviewRepository = { save: jest.fn() };
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
});