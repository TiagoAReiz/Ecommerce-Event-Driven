import { Review } from "src/core/entities/review-entity";
import { ReviewResponseDto } from "src/adapters/in/controllers/dtos/review-response";

export class ReviewMapper {
  static toResponse(review: Review): ReviewResponseDto {
    return {
      id: review.id,
      grade: review.grade,
      comment: review.comment,
      customerId: review.customerId,
      orderId: review.orderId,
      productId: review.productId,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }
}
