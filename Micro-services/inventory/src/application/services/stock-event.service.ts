import { Inject, Injectable } from '@nestjs/common';
import { STOCK_RESERVATION_REPOSITORY } from '../../core/interfaces/repositories/stock-reservation-repository.interface';
import type { IStockReservationRepository } from '../../core/interfaces/repositories/stock-reservation-repository.interface';
import {
  IStockEventService,
  OrderCancelledPayload,
  OrderCreatedPayload,
  PaymentConfirmedPayload,
  PaymentFailedPayload,
} from '../../core/interfaces/services/stock-event-service.interface';

const DEFAULT_TTL_MINUTES = 15;

@Injectable()
export class StockEventService implements IStockEventService {
  constructor(
    @Inject(STOCK_RESERVATION_REPOSITORY)
    private readonly reservationRepository: IStockReservationRepository,
  ) {}

  async handleOrderCreated(eventId: string, payload: OrderCreatedPayload): Promise<void> {
    const expiresAt = new Date(Date.now() + this.reservationTtlMs());
    await this.reservationRepository.reserveForOrder(
      eventId,
      'OrderCreated',
      {
        orderId: payload.orderId,
        subOrders: payload.subOrders.map((subOrder) => ({
          subOrderId: subOrder.subOrderId,
          items: subOrder.items.map((item) => ({
            variantId: item.variantId,
            quantity: item.quantity,
          })),
        })),
      },
      expiresAt,
    );
  }

  async handleOrderCancelled(eventId: string, payload: OrderCancelledPayload): Promise<void> {
    await this.reservationRepository.releaseSubOrders(
      eventId,
      'OrderCancelled',
      payload.subOrderIds,
      'ORDER_CANCELLED',
    );
  }

  async handlePaymentConfirmed(eventId: string, payload: PaymentConfirmedPayload): Promise<void> {
    const subOrderIds = payload.splits.map((split) => split.subOrderId);
    await this.reservationRepository.confirmForSubOrders(eventId, 'PaymentConfirmed', subOrderIds);
  }

  async handlePaymentFailed(eventId: string, payload: PaymentFailedPayload): Promise<void> {
    // `PaymentFailed` só carrega orderId — recuperamos os subOrders reservados via outbox.
    const subOrderIds = await this.reservationRepository.findReservedSubOrderIdsByOrderId(
      payload.orderId,
    );
    await this.reservationRepository.releaseSubOrders(
      eventId,
      'PaymentFailed',
      subOrderIds,
      'PAYMENT_FAILED',
    );
  }

  // TTL da reserva, via .env (RESERVATION_TTL_MINUTES). Default sensato de 15 min.
  private reservationTtlMs(): number {
    const raw = Number(process.env.RESERVATION_TTL_MINUTES);
    const minutes = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MINUTES;
    return minutes * 60 * 1000;
  }
}
