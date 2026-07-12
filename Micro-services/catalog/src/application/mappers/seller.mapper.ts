import { Seller } from '../../core/entities/seller.entity';
import { SellerPublicResponseDto } from '../../adapters/in/dtos/seller-public-response.dto';
import { SellerMeResponseDto } from '../../adapters/in/dtos/seller-me-response.dto';

export class SellerMapper {
  static toPublicResponse(seller: Seller): SellerPublicResponseDto {
    return {
      id: seller.id,
      storeName: seller.storeName,
      slug: seller.slug,
      status: seller.status,
      createdAt: seller.createdAt,
    };
  }

  static toMeResponse(seller: Seller): SellerMeResponseDto {
    return {
      id: seller.id,
      userId: seller.userId,
      storeName: seller.storeName,
      slug: seller.slug,
      document: seller.document,
      mpCollectorId: seller.mpCollectorId,
      status: seller.status,
      createdAt: seller.createdAt,
      updatedAt: seller.updatedAt,
    };
  }
}
