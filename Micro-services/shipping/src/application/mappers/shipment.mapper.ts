import { Shipment } from '../../core/entities/shipment.entity';
import { ShipmentResponseDto } from '../../adapters/in/controllers/dtos/shipment-response.dto';

export class ShipmentMapper {
  static toResponse(shipment: Shipment): ShipmentResponseDto {
    return {
      id: shipment.id,
      subOrderId: shipment.subOrderId,
      orderId: shipment.orderId,
      carrier: shipment.carrier,
      trackingCode: shipment.trackingCode,
      status: shipment.status,
      estimatedDeliveryDate: shipment.estimatedDeliveryDate
        ? shipment.estimatedDeliveryDate.toISOString()
        : null,
      createdAt: shipment.createdAt.toISOString(),
      updatedAt: shipment.updatedAt.toISOString(),
    };
  }
}
