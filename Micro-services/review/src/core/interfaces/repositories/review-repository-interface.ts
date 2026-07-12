
import { ReviewInput } from "./inputs/review-input";

export interface IReviewRepository {
    save(review: ReviewInput): Promise<void>;
}