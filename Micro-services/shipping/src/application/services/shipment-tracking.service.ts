import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Shipment } from '../../core/entities/shipment.entity';
import { SHIPMENT_REPOSITORY } from '../../core/interfaces/repositories/shipment-repository.interface';
import type {
  IShipmentRepository,
  UpdateShipmentTrackingData,
} from '../../core/interfaces/repositories/shipment-repository.interface';
import type { CreateOutboxEventInput } from '../../core/interfaces/repositories/freight-quote-repository.interface';
import { TRACKING_GATEWAY } from '../../core/interfaces/external/tracking-gateway.interface';
import type { ITrackingGateway } from '../../core/interfaces/external/tracking-gateway.interface';

const TRACKING_INTERVAL_MS = 10000;
const BATCH_SIZE = 50;

interface TrackingStep {
  update: UpdateShipmentTrackingData;
  outboxEvent: CreateOutboxEventInput | null;
}

// ============================== JOB PERIÓDICO DE RASTREIO (STUB) ===================================
// Simula o avanço do envio nos Correios. A cada tick, avança cada Shipment ATIVO um passo na máquina:
//   LABEL_PENDING -> LABEL_CREATED (gera trackingCode)
//   LABEL_CREATED -> POSTED        (publica ShipmentDispatched)
//   POSTED        -> IN_TRANSIT
//   IN_TRANSIT    -> DELIVERED     (publica ShipmentDelivered)
// A atualização de status e o evento de outbox são gravados na MESMA transação (advanceWithOutbox),
// então o Transactional Outbox garante at-least-once sem publicar sem persistir. O outbox-relay
// depois entrega ao tópico shipping-events.
// ===================================================================================================
@Injectable()
export class ShipmentTrackingService {
  private readonly logger = new Logger(ShipmentTrackingService.name);
  private isRunning = false;

  constructor(
    @Inject(SHIPMENT_REPOSITORY) private readonly shipmentRepository: IShipmentRepository,
    @Inject(TRACKING_GATEWAY) private readonly trackingGateway: ITrackingGateway,
  ) {}

  @Interval(TRACKING_INTERVAL_MS)
  async advanceShipments(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const active = await this.shipmentRepository.findActiveForTracking(BATCH_SIZE);
      for (const shipment of active) {
        await this.advanceOne(shipment);
      }
    } finally {
      this.isRunning = false;
    }
  }

  private async advanceOne(shipment: Shipment): Promise<void> {
    const step = this.nextStep(shipment);
    if (!step) return;
    try {
      await this.shipmentRepository.advanceWithOutbox(shipment.id, step.update, step.outboxEvent);
    } catch (error) {
      this.logger.error(`Failed to advance shipment ${shipment.id}`, error as Error);
    }
  }

  // Público pra permitir teste unitário direto da máquina de estados.
  nextStep(shipment: Shipment): TrackingStep | null {
    switch (shipment.status) {
      case 'LABEL_PENDING':
        return {
          update: {
            status: 'LABEL_CREATED',
            trackingCode: this.trackingGateway.generateTrackingCode(shipment.carrier),
          },
          outboxEvent: null,
        };
      case 'LABEL_CREATED':
        return {
          update: { status: 'POSTED' },
          outboxEvent: {
            aggregateType: 'Shipment',
            aggregateId: shipment.subOrderId,
            eventType: 'ShipmentDispatched',
            payload: {
              subOrderId: shipment.subOrderId,
              orderId: shipment.orderId,
              userId: shipment.userId,
              trackingCode: shipment.trackingCode,
              carrier: shipment.carrier,
              estimatedDeliveryDate: shipment.estimatedDeliveryDate
                ? shipment.estimatedDeliveryDate.toISOString()
                : null,
            },
          },
        };
      case 'POSTED':
        return { update: { status: 'IN_TRANSIT' }, outboxEvent: null };
      case 'IN_TRANSIT':
        return {
          update: { status: 'DELIVERED' },
          outboxEvent: {
            aggregateType: 'Shipment',
            aggregateId: shipment.subOrderId,
            eventType: 'ShipmentDelivered',
            payload: {
              subOrderId: shipment.subOrderId,
              orderId: shipment.orderId,
              userId: shipment.userId,
              deliveredAt: new Date().toISOString(),
            },
          },
        };
      default:
        return null; // DELIVERED / RETURNED — terminal
    }
  }
}
