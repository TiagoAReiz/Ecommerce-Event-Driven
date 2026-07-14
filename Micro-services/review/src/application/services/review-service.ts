import { Inject, Injectable } from '@nestjs/common';
import { ReviewRequest } from 'src/adapters/in/controllers/dtos/review-request';
import { REVIEW_REPOSITORY, type IReviewRepository } from 'src/core/interfaces/repositories/review-repository-interface';
import { IReviewService } from 'src/core/interfaces/services/review-service-interface';
import { Review } from 'src/core/entities/review-entity';
import { randomUUID } from 'crypto';

@Injectable()
export class ReviewService implements IReviewService {

  constructor(@Inject(REVIEW_REPOSITORY) private readonly repo: IReviewRepository) { }
  async sendReview(review: ReviewRequest) {
    const reviewByCustomer = await this.repo.findByCustomerAndProduct(review.customerId, review.productId)
    const input = {
      id: randomUUID(),
      grade: review.grade,
      comment: review.comment,
      customerId: review.customerId,
      orderId: review.orderId,
      productId: review.productId
    }
    if (reviewByCustomer) {
      await this.repo.update(reviewByCustomer.id, input);
    }
    else {
      await this.repo.save(input);
    }
    return;

  }

  async getReviewsByProductId(productId: string): Promise<Review[]> {
    return this.repo.findByProductId(productId);
  }
}
