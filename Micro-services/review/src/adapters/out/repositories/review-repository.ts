import { Injectable } from "@nestjs/common";
import { PrismaClient } from "generated/prisma/client";
import { ReviewInput } from "src/core/interfaces/repositories/inputs/review-input";
import type { IReviewRepository } from "src/core/interfaces/repositories/review-repository-interface";

@Injectable()
export class ReviewRepository implements IReviewRepository {
    constructor(private readonly prisma: PrismaClient) { }
    async save(review: ReviewInput): Promise<void> {
        await this.prisma.review.create({
            data: {
                id: review.id,
                grade: review.grade,
                comment: review.comment,
                customerId: review.customerId,
                orderId: review.orderId,
                productId: review.productId,
                createdAt: new Date(),
                updatedAt: new Date()
            }

        });
        return;

    }
}