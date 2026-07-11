import { Injectable } from '@nestjs/common';
import { OutboxEvent as PrismaOutboxEvent } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OutboxEvent } from '../../../core/entities/outbox-event.entity';
import { IOutboxEventRepository } from '../../../core/interfaces/repositories/outbox-event-repository.interface';

@Injectable()
export class OutboxEventRepository implements IOutboxEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPending(limit: number): Promise<OutboxEvent[]> {
    const rows = await this.prisma.outboxEvent.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return rows.map((row) => this.toEntity(row));
  }

  async markPublished(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  }

  private toEntity(row: PrismaOutboxEvent): OutboxEvent {
    return new OutboxEvent({
      id: row.id,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      eventType: row.eventType,
      payload: row.payload,
      createdAt: row.createdAt,
    });
  }
}
