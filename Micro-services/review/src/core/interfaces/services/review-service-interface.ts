import { ReviewRequest } from "src/adapters/in/controllers/dtos/review-request";

export const REVIEW_SERVICE = Symbol('REVIEW_SERVICE');
export interface IReviewService {
    sendReview(review: ReviewRequest): Promise<void>;

}