import { StockItem } from '../../core/entities/stock-item.entity';
import { StockAvailabilityResponseDto } from '../../adapters/in/dtos/stock-availability-response.dto';
import { StockItemResponseDto } from '../../adapters/in/dtos/stock-item-response.dto';

export class StockMapper {
  // Resposta pública da PDP: só o disponível interessa, mas expomos os totais pra debug/UX.
  static toAvailabilityResponse(stock: StockItem): StockAvailabilityResponseDto {
    return {
      variantId: stock.variantId,
      available: stock.available,
      quantity: stock.quantity,
      reservedQty: stock.reservedQty,
    };
  }

  static toItemResponse(stock: StockItem): StockItemResponseDto {
    return {
      id: stock.id,
      variantId: stock.variantId,
      sellerId: stock.sellerId,
      quantity: stock.quantity,
      reservedQty: stock.reservedQty,
      available: stock.available,
      createdAt: stock.createdAt,
      updatedAt: stock.updatedAt,
    };
  }
}
