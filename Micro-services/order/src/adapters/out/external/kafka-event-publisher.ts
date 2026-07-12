import { Injectable } from '@nestjs/common';
import { KafkaProducerService } from '../messaging/kafka-producer.service';
import { IEventPublisher } from '../../../core/interfaces/external/event-publisher.interface';

@Injectable()
export class KafkaEventPublisher implements IEventPublisher {
  constructor(private readonly producer: KafkaProducerService) {}

  async publish(topic: string, key: string, value: string): Promise<void> {
    await this.producer.publish(topic, [{ key, value }]);
  }
}
