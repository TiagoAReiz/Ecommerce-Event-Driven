
import { Review } from "../../entities/review-entity";
import { ReviewInput } from "./inputs/review-input";

export const REVIEW_REPOSITORY = Symbol('REVIEW_REPOSITORY');
export interface IReviewRepository {
    save(review: ReviewInput, sellerId: string): Promise<void>;
    findByProductId(productId: string): Promise<Review[]>;
    findByCustomerAndProduct(customerId: string, productId: string): Promise<Review | null>;
    update(id: string, review: ReviewInput): Promise<void>;
}