import { Injectable } from '@nestjs/common';
import { ReviewRequest } from 'src/adapters/in/controllers/dtos/review-request';
import type { IReviewRepository } from 'src/core/interfaces/repositories/review-repository-interface';
import { IReviewService } from 'src/core/interfaces/services/review-service-interface';
import { randomUUID } from 'crypto';

@Injectable()
export class ReviewService implements IReviewService {

  constructor(private readonly repo: IReviewRepository) { }
  async sendReview(review: ReviewRequest) {
    const customerId = "a";
    await this.repo.save(
      {
        id: randomUUID(),
        grade: review.grade,
        comment: review.comment,
        customerId: customerId,
        orderId: review.orderId,
        productId: review.productId
      }
    );
    return;

  }
}
