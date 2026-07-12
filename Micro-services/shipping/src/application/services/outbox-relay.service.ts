import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OutboxEvent } from '../../core/entities/outbox-event.entity';
import { OUTBOX_EVENT_REPOSITORY } from '../../core/interfaces/repositories/outbox-event-repository.interface';
import type { IOutboxEventRepository } from '../../core/interfaces/repositories/outbox-event-repository.interface';
import { EVENT_PUBLISHER } from '../../core/interfaces/external/event-publisher.interface';
import type { IEventPublisher } from '../../core/interfaces/external/event-publisher.interface';

const SHIPPING_EVENTS_TOPIC = 'shipping-events';
const POLL_BATCH_SIZE = 20;

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  private isRelaying = false;

  constructor(
    @Inject(OUTBOX_EVENT_REPOSITORY) private readonly outboxRepository: IOutboxEventRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  @Interval(5000)
  async relayPendingEvents(): Promise<void> {
    if (this.isRelaying) {
      return;
    }

    this.isRelaying = true;
    try {
      const pending = await this.outboxRepository.findPending(POLL_BATCH_SIZE);
      for (const event of pending) {
        await this.relayOne(event);
      }
    } finally {
      this.isRelaying = false;
    }
  }

  private async relayOne(event: OutboxEvent): Promise<void> {
    const envelope = {
      eventId: event.id,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      occurredAt: event.createdAt.toISOString(),
      version: 1,
      payload: event.payload,
    };

    try {
      // A partition key é sempre o aggregateId (subOrderId em todo shipping-event).
      await this.eventPublisher.publish(
        SHIPPING_EVENTS_TOPIC,
        event.aggregateId,
        JSON.stringify(envelope),
      );
      await this.outboxRepository.markPublished(event.id);
    } catch (error) {
      this.logger.error(`Failed to relay outbox event ${event.id}`, error as Error);
    }
  }
}
