import { Inject, Injectable } from '@nestjs/common';
import { ORDER_REPOSITORY } from '../../core/interfaces/repositories/order-repository.interface';
import type { IOrderRepository } from '../../core/interfaces/repositories/order-repository.interface';
import {
  FreightQuoteFailedPayload,
  FreightQuotedPayload,
  IOrderEventService,
  PaymentConfirmedPayload,
  PaymentFailedPayload,
  PaymentRefundedPayload,
  ShipmentDeliveredPayload,
  ShipmentDispatchedPayload,
  StockReleasedPayload,
  StockReservationFailedPayload,
  StockReservedPayload,
} from '../../core/interfaces/services/order-event-service.interface';

/**
 * Orquestra a agregação central da saga: cada método delega pro OrderRepository, que faz a
 * escrita atômica (estado + inbox + outbox) numa única transação — ver a docstring de
 * `IOrderRepository` pro detalhe do guard exactly-once de `OrderReadyForPayment`.
 */
@Injectable()
export class OrderEventService implements IOrderEventService {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orderRepository: IOrderRepository) {}

  // --- inventory-events ---

  async handleStockReserved(eventId: string, payload: StockReservedPayload): Promise<void> {
    await this.orderRepository.recordStockReserved(
      eventId,
      'StockReserved',
      payload.subOrderId,
      payload.orderId,
    );
  }

  async handleStockReservationFailed(
    eventId: string,
    payload: StockReservationFailedPayload,
  ): Promise<void> {
    const reason = payload.failedItems
      .map((item) => `${item.variantId} (requested ${item.requestedQty}, available ${item.availableQty})`)
      .join('; ');
    await this.orderRepository.recordStockReservationFailed(
      eventId,
      'StockReservationFailed',
      payload.subOrderId,
      payload.orderId,
      reason,
    );
  }

  async handleStockReleased(eventId: string, payload: StockReleasedPayload): Promise<void> {
    await this.orderRepository.recordStockReleased(eventId, 'StockReleased', payload.subOrderId, payload.reason);
  }

  // --- shipping-events ---

  async handleFreightQuoted(eventId: string, payload: FreightQuotedPayload): Promise<void> {
    await this.orderRepository.recordFreightQuoted(
      eventId,
      'FreightQuoted',
      payload.subOrderId,
      payload.orderId,
      payload.price,
    );
  }

  async handleFreightQuoteFailed(eventId: string, payload: FreightQuoteFailedPayload): Promise<void> {
    await this.orderRepository.recordFreightQuoteFailed(
      eventId,
      'FreightQuoteFailed',
      payload.subOrderId,
      payload.orderId,
      payload.reason,
    );
  }

  async handleShipmentDispatched(eventId: string, payload: ShipmentDispatchedPayload): Promise<void> {
    await this.orderRepository.recordShipmentDispatched(eventId, 'ShipmentDispatched', payload.subOrderId);
  }

  async handleShipmentDelivered(eventId: string, payload: ShipmentDeliveredPayload): Promise<void> {
    await this.orderRepository.recordShipmentDelivered(eventId, 'ShipmentDelivered', payload.subOrderId);
  }

  // --- payment-events ---

  async handlePaymentConfirmed(eventId: string, payload: PaymentConfirmedPayload): Promise<void> {
    const subOrderIds = payload.splits.map((split) => split.subOrderId);
    await this.orderRepository.recordPaymentConfirmed(eventId, 'PaymentConfirmed', payload.orderId, subOrderIds);
  }

  async handlePaymentFailed(eventId: string, payload: PaymentFailedPayload): Promise<void> {
    await this.orderRepository.recordPaymentFailed(eventId, 'PaymentFailed', payload.orderId, payload.reason);
  }

  async handlePaymentRefunded(eventId: string, payload: PaymentRefundedPayload): Promise<void> {
    const subOrderIds = payload.splits.map((split) => split.subOrderId);
    await this.orderRepository.recordPaymentRefunded(eventId, 'PaymentRefunded', subOrderIds);
  }
}
