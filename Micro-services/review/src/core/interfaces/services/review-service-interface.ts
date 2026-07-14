import { ReviewRequest } from "src/adapters/in/controllers/dtos/review-request";
import { Review } from "src/core/entities/review-entity";

export const REVIEW_SERVICE = Symbol('REVIEW_SERVICE');
export interface IReviewService {
    sendReview(review: ReviewRequest): Promise<void>;
    getReviewsByProductId(productId: string): Promise<Review[]>;

}