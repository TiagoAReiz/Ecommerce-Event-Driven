import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../adapters/out/database/prisma.service';
import { KafkaProducerService } from '../../adapters/out/messaging/kafka-producer.service';

const AUTH_EVENTS_TOPIC = 'auth-events';
const POLL_BATCH_SIZE = 20;

interface OutboxRow {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
}

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly producer: KafkaProducerService,
  ) {}

  @Interval(5000)
  async relayPendingEvents(): Promise<void> {
    const pending = await this.prisma.outboxEvent.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: POLL_BATCH_SIZE,
    });

    for (const event of pending as OutboxRow[]) {
      await this.relayOne(event);
    }
  }

  private async relayOne(event: OutboxRow): Promise<void> {
    const envelope = {
      eventId: randomUUID(),
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      occurredAt: event.createdAt.toISOString(),
      version: 1,
      payload: event.payload,
    };

    try {
      await this.producer.publish(AUTH_EVENTS_TOPIC, [
        { key: event.aggregateId, value: JSON.stringify(envelope) },
      ]);
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(`Failed to relay outbox event ${event.id}`, error as Error);
    }
  }
}
