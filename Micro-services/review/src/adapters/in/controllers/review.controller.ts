import { Controller, Post, UseGuards } from '@nestjs/common';
import { ReviewRequest } from '../dtos/review-request';
import type { IReviewService } from 'src/core/interfaces/services/review-service-interface';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller()
export class ReviewController {
  constructor(private readonly reviewService: IReviewService) { }

  @Post()
  @UseGuards(JwtAuthGuard)
  sendReview(review: ReviewRequest) {
    return this.reviewService.sendReview(review);
  }
}
