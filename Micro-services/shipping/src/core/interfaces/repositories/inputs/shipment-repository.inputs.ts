import { ShipmentStatus } from '../../../entities/shipment.entity';

// Forma de escrita pra criar um Shipment (reativo a PaymentConfirmed) e atualizar o rastreio (job).
export interface CreateShipmentData {
  id: string;
  subOrderId: string;
  orderId: string;
  userId: string;
  addressId: string;
  carrier: string;
  estimatedDeliveryDate: Date | null;
}

export interface UpdateShipmentTrackingData {
  status: ShipmentStatus;
  trackingCode?: string | null;
  estimatedDeliveryDate?: Date | null;
}
