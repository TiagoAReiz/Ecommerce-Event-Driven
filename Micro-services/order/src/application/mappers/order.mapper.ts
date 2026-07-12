import { Order } from '../../core/entities/order.entity';
import { OrderWithSubOrders } from '../../core/interfaces/repositories/order-repository.interface';
import { OrderResponseDto } from '../../adapters/in/controllers/dtos/order-response.dto';
import { SubOrderMapper } from './sub-order.mapper';

export class OrderMapper {
  static toSummaryResponse(order: Order): OrderResponseDto {
    return {
      id: order.id,
      userId: order.userId,
      addressId: order.addressId,
      status: order.status,
      totalAmount: order.totalAmount,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  static toDetailResponse(detail: OrderWithSubOrders): OrderResponseDto {
    return {
      ...this.toSummaryResponse(detail.order),
      subOrders: detail.subOrders.map(({ subOrder, items }) => SubOrderMapper.toResponse(subOrder, items)),
    };
  }
}
