import { ReviewRequest } from "src/adapters/in/controllers/dtos/review-request";

export interface IReviewService {
    sendReview(review: ReviewRequest): Promise<void>;

}