import { Module } from '@nestjs/common';
import { KafkaConsumerService } from './kafka-consumer.service';
import { KafkaProducerService } from './kafka-producer.service';
import { kafkaClientProvider } from './kafka-client.provider';

@Module({
  providers: [KafkaConsumerService, KafkaProducerService, kafkaClientProvider],
  exports: [KafkaConsumerService, KafkaProducerService],
})
export class KafkaModule { }
