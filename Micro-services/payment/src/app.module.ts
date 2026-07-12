import { Module } from '@nestjs/common';
import { PrismaModule } from './adapters/out/database/prisma.module';
import { KafkaModule } from './adapters/out/messaging/kafka.module';
import { PaymentModule } from './payment.module';

@Module({
  imports: [PrismaModule, KafkaModule, PaymentModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
