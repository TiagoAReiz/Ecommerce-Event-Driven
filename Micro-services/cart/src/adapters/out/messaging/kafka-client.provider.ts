import { KafkaJS } from '@confluentinc/kafka-javascript';

export const KAFKA_CLIENT = Symbol('KAFKA_CLIENT');

export const kafkaClientProvider = {
  provide: KAFKA_CLIENT,
  useFactory: (): KafkaJS.Kafka =>
    new KafkaJS.Kafka({
      kafkaJS: {
        clientId: process.env.KAFKA_CLIENT_ID ?? 'app',
        brokers: [process.env.KAFKA_BROKER ?? 'localhost:9094'],
      },
    }),
};
