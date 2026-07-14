import { Injectable } from '@nestjs/common';
import { IEventPublisher } from 'src/core/interfaces/external/event-publisher.interface';
import { KafkaProducerService } from '../messaging/kafka/kafka-producer.service';

@Injectable()
export class KafkaEventPublisher implements IEventPublisher {
  constructor(private readonly producer: KafkaProducerService) { }

  async publish(topic: string, key: string, value: string): Promise<void> {
    await this.producer.publish(topic, [{ key, value }]);
  }
}
