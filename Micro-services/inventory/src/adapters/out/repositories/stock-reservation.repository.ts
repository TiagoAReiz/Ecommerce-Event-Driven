import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  IStockReservationRepository,
  ReleaseReason,
  ReserveOrderInput,
  ReserveSubOrderInput,
} from '../../../core/interfaces/repositories/stock-reservation-repository.interface';

// Transaction client type (subset of PrismaClient exposed inside `$transaction`).
type Tx = Prisma.TransactionClient;

const AGGREGATE_TYPE = 'StockReservation';

@Injectable()
export class StockReservationRepository implements IStockReservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async reserveForOrder(
    eventId: string,
    eventType: string,
    order: ReserveOrderInput,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (await this.alreadyProcessed(tx, eventId)) return;

      for (const subOrder of order.subOrders) {
        await this.reserveSubOrder(tx, order.orderId, subOrder, expiresAt);
      }

      await tx.processedEvent.create({ data: { eventId, eventType } });
    });
  }

  // Reserva all-or-nothing por SubOrder: só debita disponível se TODOS os itens couberem.
  private async reserveSubOrder(
    tx: Tx,
    orderId: string,
    subOrder: ReserveSubOrderInput,
    expiresAt: Date,
  ): Promise<void> {
    const failedItems: { variantId: string; requestedQty: number; availableQty: number }[] = [];

    for (const item of subOrder.items) {
      const stock = await tx.stockItem.findUnique({ where: { variantId: item.variantId } });
      const available = stock ? stock.quantity - stock.reservedQty : 0;
      if (item.quantity > available) {
        failedItems.push({
          variantId: item.variantId,
          requestedQty: item.quantity,
          availableQty: available,
        });
      }
    }

    if (failedItems.length > 0) {
      await tx.outboxEvent.create({
        data: {
          aggregateType: AGGREGATE_TYPE,
          aggregateId: subOrder.subOrderId,
          eventType: 'StockReservationFailed',
          payload: { subOrderId: subOrder.subOrderId, orderId, failedItems },
        },
      });
      return;
    }

    const reservations: { variantId: string; quantity: number; reservationId: string }[] = [];
    for (const item of subOrder.items) {
      await tx.stockItem.update({
        where: { variantId: item.variantId },
        data: { reservedQty: { increment: item.quantity } },
      });
      const reservation = await tx.stockReservation.create({
        data: {
          variantId: item.variantId,
          subOrderId: subOrder.subOrderId,
          quantity: item.quantity,
          status: 'PENDING',
          expiresAt,
        },
      });
      reservations.push({
        variantId: item.variantId,
        quantity: item.quantity,
        reservationId: reservation.id,
      });
    }

    await tx.outboxEvent.create({
      data: {
        aggregateType: AGGREGATE_TYPE,
        aggregateId: subOrder.subOrderId,
        eventType: 'StockReserved',
        payload: { subOrderId: subOrder.subOrderId, orderId, reservations },
      },
    });
  }

  async confirmForSubOrders(
    eventId: string,
    eventType: string,
    subOrderIds: string[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (await this.alreadyProcessed(tx, eventId)) return;

      for (const subOrderId of subOrderIds) {
        const pending = await tx.stockReservation.findMany({
          where: { subOrderId, status: 'PENDING' },
        });
        for (const reservation of pending) {
          // Guard idempotente: só age se ainda PENDING (updateMany devolve count).
          const updated = await tx.stockReservation.updateMany({
            where: { id: reservation.id, status: 'PENDING' },
            data: { status: 'CONFIRMED' },
          });
          if (updated.count === 1) {
            await tx.stockItem.update({
              where: { variantId: reservation.variantId },
              data: {
                quantity: { decrement: reservation.quantity },
                reservedQty: { decrement: reservation.quantity },
              },
            });
          }
        }
      }

      await tx.processedEvent.create({ data: { eventId, eventType } });
    });
  }

  async releaseSubOrders(
    eventId: string,
    eventType: string,
    subOrderIds: string[],
    reason: ReleaseReason,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (await this.alreadyProcessed(tx, eventId)) return;

      for (const subOrderId of subOrderIds) {
        const releasedItems = await this.releaseSubOrderPending(tx, subOrderId);
        if (releasedItems.length > 0) {
          await tx.outboxEvent.create({
            data: {
              aggregateType: AGGREGATE_TYPE,
              aggregateId: subOrderId,
              eventType: 'StockReleased',
              payload: { subOrderId, releasedItems, reason },
            },
          });
        }
      }

      await tx.processedEvent.create({ data: { eventId, eventType } });
    });
  }

  // Libera as reservas PENDING de um SubOrder, devolvendo o que foi efetivamente liberado.
  private async releaseSubOrderPending(
    tx: Tx,
    subOrderId: string,
  ): Promise<{ variantId: string; quantity: number }[]> {
    const pending = await tx.stockReservation.findMany({ where: { subOrderId, status: 'PENDING' } });
    const releasedItems: { variantId: string; quantity: number }[] = [];

    for (const reservation of pending) {
      const updated = await tx.stockReservation.updateMany({
        where: { id: reservation.id, status: 'PENDING' },
        data: { status: 'RELEASED' },
      });
      if (updated.count === 1) {
        await tx.stockItem.update({
          where: { variantId: reservation.variantId },
          data: { reservedQty: { decrement: reservation.quantity } },
        });
        releasedItems.push({ variantId: reservation.variantId, quantity: reservation.quantity });
      }
    }

    return releasedItems;
  }

  async findReservedSubOrderIdsByOrderId(orderId: string): Promise<string[]> {
    // `PaymentFailed` só carrega orderId; recuperamos os subOrders reservados pelos StockReserved
    // já persistidos no outbox (aggregateId = subOrderId, payload.orderId = orderId).
    const rows = await this.prisma.outboxEvent.findMany({
      where: {
        eventType: 'StockReserved',
        payload: { path: ['orderId'], equals: orderId },
      },
      select: { aggregateId: true },
    });
    return [...new Set(rows.map((row) => row.aggregateId))];
  }

  async expireDueReservations(now: Date): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const due = await tx.stockReservation.findMany({
        where: { status: 'PENDING', expiresAt: { lt: now } },
      });
      if (due.length === 0) return 0;

      const bySubOrder = new Map<string, { variantId: string; quantity: number }[]>();
      let expiredCount = 0;

      for (const reservation of due) {
        const updated = await tx.stockReservation.updateMany({
          where: { id: reservation.id, status: 'PENDING' },
          data: { status: 'EXPIRED' },
        });
        if (updated.count !== 1) continue;

        await tx.stockItem.update({
          where: { variantId: reservation.variantId },
          data: { reservedQty: { decrement: reservation.quantity } },
        });
        expiredCount += 1;

        const items = bySubOrder.get(reservation.subOrderId) ?? [];
        items.push({ variantId: reservation.variantId, quantity: reservation.quantity });
        bySubOrder.set(reservation.subOrderId, items);
      }

      for (const [subOrderId, releasedItems] of bySubOrder) {
        await tx.outboxEvent.create({
          data: {
            aggregateType: AGGREGATE_TYPE,
            aggregateId: subOrderId,
            eventType: 'StockReleased',
            payload: { subOrderId, releasedItems, reason: 'EXPIRED' },
          },
        });
      }

      return expiredCount;
    });
  }

  private async alreadyProcessed(tx: Tx, eventId: string): Promise<boolean> {
    return (await tx.processedEvent.findUnique({ where: { eventId } })) !== null;
  }
}
