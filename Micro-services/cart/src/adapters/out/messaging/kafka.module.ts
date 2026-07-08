import { Global, Module } from '@nestjs/common';
import { kafkaClientProvider } from './kafka-client.provider';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';

@Global()
@Module({
  providers: [kafkaClientProvider, KafkaProducerService, KafkaConsumerService],
  exports: [KafkaProducerService, KafkaConsumerService],
})
export class KafkaModule {}
