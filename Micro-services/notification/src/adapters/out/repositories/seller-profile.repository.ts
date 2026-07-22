import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SellerProfile } from '../../../core/entities/seller-profile.entity';
import { ISellerProfileRepository } from '../../../core/interfaces/repositories/seller-profile-repository.interface';
import { UpsertSellerProfileInput } from '../../../core/interfaces/repositories/inputs/seller-profile-repository.inputs';

@Injectable()
export class SellerProfileRepository implements ISellerProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBySellerId(sellerId: string): Promise<SellerProfile | null> {
    const row = await this.prisma.sellerProfile.findUnique({ where: { sellerId } });
    return row ? new SellerProfile({ sellerId: row.sellerId, userId: row.userId }) : null;
  }

  async upsertWithInbox(
    eventId: string,
    eventType: string,
    input: UpsertSellerProfileInput,
  ): Promise<boolean> {
    let processedNow = false;

    await this.prisma.$transaction(async (tx) => {
      if (await tx.processedEvent.findUnique({ where: { eventId } })) return;

      await tx.sellerProfile.upsert({
        where: { sellerId: input.sellerId },
        create: { sellerId: input.sellerId, userId: input.userId },
        update: { userId: input.userId },
      });

      await tx.processedEvent.create({ data: { eventId, eventType } });
      processedNow = true;
    });

    return processedNow;
  }
}
