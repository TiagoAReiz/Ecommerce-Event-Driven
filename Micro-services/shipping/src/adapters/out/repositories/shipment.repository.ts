import { Injectable } from '@nestjs/common';
import { Shipment as PrismaShipment, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { Shipment, ShipmentStatus } from '../../../core/entities/shipment.entity';
import {
  CreateShipmentData,
  IShipmentRepository,
  UpdateShipmentTrackingData,
} from '../../../core/interfaces/repositories/shipment-repository.interface';
import { CreateOutboxEventInput } from '../../../core/interfaces/repositories/freight-quote-repository.interface';

const TERMINAL_STATUSES: ShipmentStatus[] = ['DELIVERED', 'RETURNED'];

@Injectable()
export class ShipmentRepository implements IShipmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBySubOrderId(subOrderId: string): Promise<Shipment | null> {
    const row = await this.prisma.shipment.findUnique({ where: { subOrderId } });
    return row ? this.toEntity(row) : null;
  }

  async findActiveForTracking(limit: number): Promise<Shipment[]> {
    const rows = await this.prisma.shipment.findMany({
      where: { status: { notIn: TERMINAL_STATUSES } },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
    return rows.map((row) => this.toEntity(row));
  }

  async createShipmentsWithInbox(
    eventId: string,
    eventType: string,
    shipments: CreateShipmentData[],
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // dedupe: se já processamos esse eventId, no-op (ver ProcessedEvent inbox pattern)
      if (await tx.processedEvent.findUnique({ where: { eventId } })) return false;

      for (const s of shipments) {
        await tx.shipment.create({
          data: {
            id: s.id,
            subOrderId: s.subOrderId,
            orderId: s.orderId,
            userId: s.userId,
            addressId: s.addressId,
            carrier: s.carrier,
            estimatedDeliveryDate: s.estimatedDeliveryDate,
          },
        });
      }

      await tx.processedEvent.create({ data: { eventId, eventType } });
      return true;
    });
  }

  async advanceWithOutbox(
    id: string,
    update: UpdateShipmentTrackingData,
    outboxEvent: CreateOutboxEventInput | null,
  ): Promise<Shipment> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.shipment.update({
        where: { id },
        data: {
          status: update.status,
          trackingCode: update.trackingCode,
          estimatedDeliveryDate: update.estimatedDeliveryDate,
        },
      });

      if (outboxEvent) {
        await tx.outboxEvent.create({
          data: {
            ...(outboxEvent.id ? { id: outboxEvent.id } : {}),
            aggregateType: outboxEvent.aggregateType,
            aggregateId: outboxEvent.aggregateId,
            eventType: outboxEvent.eventType,
            payload: outboxEvent.payload as Prisma.InputJsonValue,
          },
        });
      }

      return this.toEntity(row);
    });
  }

  private toEntity(row: PrismaShipment): Shipment {
    return new Shipment({
      id: row.id,
      subOrderId: row.subOrderId,
      orderId: row.orderId,
      userId: row.userId,
      addressId: row.addressId,
      carrier: row.carrier,
      trackingCode: row.trackingCode,
      status: row.status as ShipmentStatus,
      estimatedDeliveryDate: row.estimatedDeliveryDate,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
