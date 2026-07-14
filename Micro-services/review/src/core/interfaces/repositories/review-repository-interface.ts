
import { ReviewInput } from "./inputs/review-input";

export const REVIEW_REPOSITORY = Symbol('REVIEW_REPOSITORY');
export interface IReviewRepository {
    save(review: ReviewInput): Promise<void>;
}