import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KAFKA_CLIENT } from './kafka-client.provider';

export type KafkaMessageHandler = (message: KafkaJS.EachMessagePayload) => Promise<void>;

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly consumer: KafkaJS.Consumer;
  private readonly handlers = new Map<string, KafkaMessageHandler>();

  constructor(@Inject(KAFKA_CLIENT) kafka: KafkaJS.Kafka) {
    this.consumer = kafka.consumer({
      kafkaJS: {
        groupId: process.env.KAFKA_CONSUMER_GROUP_ID ?? `${process.env.KAFKA_CLIENT_ID ?? 'app'}-group`,
        fromBeginning: true,
      },
    });
  }

  async onModuleInit() {
    await this.consumer.connect();
  }

  async registerHandler(topic: string, handler: KafkaMessageHandler) {
    this.handlers.set(topic, handler);
    await this.consumer.subscribe({ topic });
  }

  async onApplicationBootstrap() {
    if (this.handlers.size === 0) return;

    await this.consumer.run({
      eachMessage: async (payload) => {
        const handler = this.handlers.get(payload.topic);
        if (handler) await handler(payload);
      },
    });
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }
}
