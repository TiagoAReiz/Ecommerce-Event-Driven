import { Shipment, ShipmentStatus } from '../../entities/shipment.entity';
import { CreateOutboxEventInput } from './freight-quote-repository.interface';

export const SHIPMENT_REPOSITORY = Symbol('SHIPMENT_REPOSITORY');

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

export interface IShipmentRepository {
  findBySubOrderId(subOrderId: string): Promise<Shipment | null>;
  /** Shipments em estado não-terminal (nem DELIVERED nem RETURNED), pro job de rastreio. */
  findActiveForTracking(limit: number): Promise<Shipment[]>;
  /**
   * Transação: se `eventId` já foi processado, no-op e retorna `false`. Senão, cria os Shipments +
   * ProcessedEvent (inbox) atomicamente e retorna `true`. Não emite evento (o outbox de
   * ShipmentDispatched/Delivered é escrito depois, pelo job de rastreio).
   */
  createShipmentsWithInbox(
    eventId: string,
    eventType: string,
    shipments: CreateShipmentData[],
  ): Promise<boolean>;
  /**
   * Transação: atualiza o status/tracking do Shipment e (se houver) grava o evento de outbox na
   * MESMA transação — o avanço de status e a publicação do ShipmentDispatched/Delivered são atômicos.
   */
  advanceWithOutbox(
    id: string,
    update: UpdateShipmentTrackingData,
    outboxEvent: CreateOutboxEventInput | null,
  ): Promise<Shipment>;
}
