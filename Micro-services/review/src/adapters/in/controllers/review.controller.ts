import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ReviewRequest } from './dtos/review-request';
import type { ReviewResponseDto } from './dtos/review-response';
import type { IReviewService } from 'src/core/interfaces/services/review-service-interface';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { REVIEW_SERVICE } from 'src/core/interfaces/services/review-service-interface';
import { ReviewMapper } from 'src/application/mappers/review-mapper';

@Controller('reviews')
@UseGuards(JwtAuthGuard)
export class ReviewController {
  constructor(@Inject(REVIEW_SERVICE) private readonly reviewService: IReviewService) { }

  @Post()
  async sendReview(@Req() request: Request, @Body() review: ReviewRequest): Promise<void> {
    const accessToken = this.extractBearerToken(request);
    return this.reviewService.sendReview(request.user!.sub, accessToken, review);
  }

  @Get('product/:productId')
  async getByProductId(@Param('productId') productId: string): Promise<ReviewResponseDto[]> {
    const reviews = await this.reviewService.getReviewsByProductId(productId);
    return reviews.map((review) => ReviewMapper.toResponse(review));
  }

  private extractBearerToken(request: Request): string {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new BadRequestException('Missing bearer token');
    }
    return header.slice('Bearer '.length);
  }
}
