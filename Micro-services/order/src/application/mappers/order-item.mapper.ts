import { OrderItem } from '../../core/entities/order-item.entity';
import { OrderItemResponseDto } from '../../adapters/in/controllers/dtos/order-item-response.dto';

export class OrderItemMapper {
  static toResponse(item: OrderItem): OrderItemResponseDto {
    return {
      id: item.id,
      variantId: item.variantId,
      sku: item.skuSnapshot,
      title: item.titleSnapshot,
      unitPrice: item.unitPriceSnapshot,
      quantity: item.quantity,
      weightGrams: item.weightGramsSnapshot,
    };
  }
}
