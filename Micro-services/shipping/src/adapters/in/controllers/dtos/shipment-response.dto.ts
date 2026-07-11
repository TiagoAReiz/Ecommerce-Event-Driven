import { ShipmentStatus } from '../../../../core/entities/shipment.entity';

export interface ShipmentResponseDto {
  id: string;
  subOrderId: string;
  orderId: string;
  carrier: string;
  trackingCode: string | null;
  status: ShipmentStatus;
  estimatedDeliveryDate: string | null;
  createdAt: string;
  updatedAt: string;
}
