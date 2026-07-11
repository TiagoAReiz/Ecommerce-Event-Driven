import { Module } from '@nestjs/common';
import { PrismaModule } from './adapters/out/database/prisma.module';
import { KafkaModule } from './adapters/out/messaging/kafka.module';
import { ShippingModule } from './shipping.module';

@Module({
  imports: [PrismaModule, KafkaModule, ShippingModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
