import { Inject, Injectable } from '@nestjs/common';
import { ReviewRequest } from 'src/adapters/in/controllers/dtos/review-request';
import { REVIEW_REPOSITORY, type IReviewRepository } from 'src/core/interfaces/repositories/review-repository-interface';
import { ORDER_CLIENT, type IOrderClient } from 'src/core/interfaces/external/order-client.interface';
import { IReviewService } from 'src/core/interfaces/services/review-service-interface';
import { ProductNotPurchasedException } from 'src/core/exceptions/product-not-purchased.exception';
import { Review } from 'src/core/entities/review-entity';
import { randomUUID } from 'crypto';

@Injectable()
export class ReviewService implements IReviewService {

  constructor(
    @Inject(REVIEW_REPOSITORY) private readonly repo: IReviewRepository,
    @Inject(ORDER_CLIENT) private readonly orderClient: IOrderClient,
  ) { }

  async sendReview(customerId: string, accessToken: string, review: ReviewRequest): Promise<void> {
    const verification = await this.orderClient.verifyPurchase(accessToken, review.orderId, review.productId);
    if (!verification.eligible) {
      throw new ProductNotPurchasedException();
    }

    const reviewByCustomer = await this.repo.findByCustomerAndProduct(customerId, review.productId);
    const input = {
      id: randomUUID(),
      grade: review.grade,
      comment: review.comment,
      customerId,
      orderId: review.orderId,
      productId: review.productId,
    };

    if (reviewByCustomer) {
      await this.repo.update(reviewByCustomer.id, input);
    } else {
      await this.repo.save(input, verification.sellerId);
    }
  }

  async getReviewsByProductId(productId: string): Promise<Review[]> {
    return this.repo.findByProductId(productId);
  }
}
