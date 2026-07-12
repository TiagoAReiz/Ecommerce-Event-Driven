import { Injectable } from '@nestjs/common';
import { Prisma, Seller as PrismaSeller } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { Seller, SellerStatus } from '../../../core/entities/seller.entity';
import { DuplicateSellerDocumentException } from '../../../core/exceptions/duplicate-seller-document.exception';
import { SellerAlreadyOnboardedException } from '../../../core/exceptions/seller-already-onboarded.exception';
import {
  CreateOutboxEventInput,
  CreateSellerInput,
  ISellerRepository,
} from '../../../core/interfaces/repositories/seller-repository.interface';

@Injectable()
export class SellerRepository implements ISellerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Seller | null> {
    const row = await this.prisma.seller.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async findByUserId(userId: string): Promise<Seller | null> {
    const row = await this.prisma.seller.findUnique({ where: { userId } });
    return row ? this.toEntity(row) : null;
  }

  async createWithEvent(seller: CreateSellerInput, event: CreateOutboxEventInput): Promise<Seller> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.seller.create({ data: seller });
        await tx.outboxEvent.create({
          data: {
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            eventType: event.eventType,
            payload: event.payload as Prisma.InputJsonValue,
          },
        });
        return created;
      });
      return this.toEntity(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = (error.meta?.target as string[] | undefined) ?? [];
        if (target.includes('userId')) {
          throw new SellerAlreadyOnboardedException();
        }
        throw new DuplicateSellerDocumentException();
      }
      throw error;
    }
  }

  async update(id: string, data: { storeName?: string; mpCollectorId?: string }): Promise<Seller> {
    const row = await this.prisma.seller.update({ where: { id }, data });
    return this.toEntity(row);
  }

  private toEntity(row: PrismaSeller): Seller {
    return new Seller({
      id: row.id,
      userId: row.userId,
      storeName: row.storeName,
      slug: row.slug,
      document: row.document,
      mpCollectorId: row.mpCollectorId,
      status: row.status as SellerStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
