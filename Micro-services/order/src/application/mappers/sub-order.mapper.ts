import { SubOrder } from '../../core/entities/sub-order.entity';
import { OrderItem } from '../../core/entities/order-item.entity';
import { SubOrderResponseDto } from '../../adapters/in/controllers/dtos/sub-order-response.dto';
import { OrderItemMapper } from './order-item.mapper';

export class SubOrderMapper {
  static toResponse(subOrder: SubOrder, items?: OrderItem[]): SubOrderResponseDto {
    return {
      id: subOrder.id,
      orderId: subOrder.orderId,
      sellerId: subOrder.sellerId,
      status: subOrder.status,
      subtotalAmount: subOrder.subtotalAmount,
      shippingAmount: subOrder.shippingAmount,
      cancelReason: subOrder.cancelReason,
      createdAt: subOrder.createdAt,
      updatedAt: subOrder.updatedAt,
      items: items ? items.map((item) => OrderItemMapper.toResponse(item)) : undefined,
    };
  }
}
