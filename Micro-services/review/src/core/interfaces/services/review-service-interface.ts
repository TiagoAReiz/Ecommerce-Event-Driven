import { ReviewRequest } from "src/adapters/in/dtos/review-request";

export interface IReviewService {
    sendReview(review: ReviewRequest): Promise<void>;

}