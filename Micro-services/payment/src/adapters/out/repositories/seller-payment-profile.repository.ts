import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SellerPaymentProfile } from '../../../core/entities/seller-payment-profile.entity';
import { ISellerPaymentProfileRepository } from '../../../core/interfaces/repositories/seller-payment-profile-repository.interface';
import { UpsertSellerPaymentProfileInput } from '../../../core/interfaces/repositories/inputs/seller-payment-profile-repository.inputs';

@Injectable()
export class SellerPaymentProfileRepository implements ISellerPaymentProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBySellerId(sellerId: string): Promise<SellerPaymentProfile | null> {
    const row = await this.prisma.sellerPaymentProfile.findUnique({ where: { sellerId } });
    return row
      ? new SellerPaymentProfile({
          sellerId: row.sellerId,
          userId: row.userId,
          mpCollectorId: row.mpCollectorId,
        })
      : null;
  }

  async findByUserId(userId: string): Promise<SellerPaymentProfile[]> {
    const rows = await this.prisma.sellerPaymentProfile.findMany({ where: { userId } });
    return rows.map(
      (row) =>
        new SellerPaymentProfile({
          sellerId: row.sellerId,
          userId: row.userId,
          mpCollectorId: row.mpCollectorId,
        }),
    );
  }

  async upsertWithInbox(
    eventId: string,
    eventType: string,
    input: UpsertSellerPaymentProfileInput,
  ): Promise<boolean> {
    let processedNow = false;

    await this.prisma.$transaction(async (tx) => {
      // dedupe: se já processamos esse eventId, no-op (ProcessedEvent inbox pattern)
      if (await tx.processedEvent.findUnique({ where: { eventId } })) return;

      await tx.sellerPaymentProfile.upsert({
        where: { sellerId: input.sellerId },
        create: {
          sellerId: input.sellerId,
          userId: input.userId,
          mpCollectorId: input.mpCollectorId,
        },
        update: { userId: input.userId, mpCollectorId: input.mpCollectorId },
      });

      await tx.processedEvent.create({ data: { eventId, eventType } });
      processedNow = true;
    });

    return processedNow;
  }
}
