import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KAFKA_CLIENT } from './kafka-client.provider';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly producer: KafkaJS.Producer;

  constructor(@Inject(KAFKA_CLIENT) kafka: KafkaJS.Kafka) {
    this.producer = kafka.producer();
  }

  async onModuleInit() {
    await this.producer.connect();
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
  }

  async publish(topic: string, messages: KafkaJS.Message[]) {
    await this.producer.send({ topic, messages });
  }
}
