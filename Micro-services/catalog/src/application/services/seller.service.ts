import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Seller } from '../../core/entities/seller.entity';
import { SellerNotFoundException } from '../../core/exceptions/seller-not-found.exception';
import { SELLER_REPOSITORY } from '../../core/interfaces/repositories/seller-repository.interface';
import type { ISellerRepository } from '../../core/interfaces/repositories/seller-repository.interface';
import type {
  ISellerService,
  OnboardSellerInput,
  UpdateSellerInput,
} from '../../core/interfaces/services/seller-service.interface';

@Injectable()
export class SellerService implements ISellerService {
  constructor(@Inject(SELLER_REPOSITORY) private readonly sellerRepository: ISellerRepository) {}

  async onboard(userId: string, input: OnboardSellerInput): Promise<Seller> {
    const id = randomUUID();
    const slug = this.buildSlug(input.storeName);

    return this.sellerRepository.createWithEvent(
      {
        id,
        userId,
        storeName: input.storeName,
        slug,
        document: input.document,
        mpCollectorId: input.mpCollectorId,
        status: 'ACTIVE',
      },
      {
        aggregateType: 'Seller',
        aggregateId: id,
        eventType: 'SellerOnboarded',
        payload: {
          sellerId: id,
          userId,
          storeName: input.storeName,
          document: input.document,
          mpCollectorId: input.mpCollectorId,
        },
      },
    );
  }

  async getPublic(sellerId: string): Promise<Seller> {
    const seller = await this.sellerRepository.findById(sellerId);
    if (!seller) {
      throw new SellerNotFoundException();
    }
    return seller;
  }

  async getMe(userId: string): Promise<Seller> {
    const seller = await this.sellerRepository.findByUserId(userId);
    if (!seller) {
      throw new SellerNotFoundException();
    }
    return seller;
  }

  async updateMe(userId: string, input: UpdateSellerInput): Promise<Seller> {
    const seller = await this.getMe(userId);
    return this.sellerRepository.update(seller.id, {
      storeName: input.storeName,
      mpCollectorId: input.mpCollectorId,
    });
  }

  // Regra de negócio explícita no service: gera um slug único a partir do storeName
  // (sem endpoint de escrita pra slug — não há como o cliente colidir de propósito).
  private buildSlug(storeName: string): string {
    const base = storeName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-+|-+$)/g, '');
    return `${base || 'loja'}-${randomUUID().slice(0, 8)}`;
  }
}
