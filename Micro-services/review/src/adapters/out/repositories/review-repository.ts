import { Injectable } from "@nestjs/common";
import type { Prisma, Review as PrismaReview } from "generated/prisma/client";
import { PrismaService } from "src/adapters/out/database/prisma.service";
import { Review } from "src/core/entities/review-entity";
import { ReviewInput } from "src/core/interfaces/repositories/inputs/review-input";
import type { IReviewRepository } from "src/core/interfaces/repositories/review-repository-interface";

@Injectable()
export class ReviewRepository implements IReviewRepository {
    constructor(private readonly prisma: PrismaService) { }

    async save(review: ReviewInput, sellerId: string): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            await tx.review.create({
                data: {
                    id: review.id,
                    grade: review.grade,
                    comment: review.comment,
                    customerId: review.customerId,
                    orderId: review.orderId,
                    productId: review.productId,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            });

            await tx.outboxEvent.create({
                data: {
                    aggregateType: 'Review',
                    aggregateId: review.id,
                    eventType: 'ReviewSent',
                    payload: {
                        reviewId: review.id,
                        customerId: review.customerId,
                        productId: review.productId,
                        sellerId,
                        grade: review.grade,
                        comment: review.comment,
                        orderId: review.orderId,
                    } as Prisma.InputJsonValue,
                },
            });
        });
    }

    async findByProductId(productId: string): Promise<Review[]> {
        const rows = await this.prisma.review.findMany({
            where: { productId },
            orderBy: { createdAt: 'desc' },
        });
        return rows.map((row) => this.toEntity(row));
    }

    private toEntity(row: PrismaReview): Review {
        return new Review({
            id: row.id,
            grade: row.grade,
            comment: row.comment,
            customerId: row.customerId,
            orderId: row.orderId,
            productId: row.productId,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        });
    }
    async findByCustomerAndProduct(customerId: string, productId: string): Promise<Review | null> {
        const row = await this.prisma.review.findFirst({
            where: { customerId, productId },
        });
        return row ? this.toEntity(row) : null;
    }
    async update(id: string, review: ReviewInput): Promise<void> {
        await this.prisma.review.update({
            where: { id },
            data: {
                grade: review.grade,
                comment: review.comment,
                updatedAt: new Date()
            }
        });
        return;
    }
}