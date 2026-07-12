import { Module } from '@nestjs/common';
import { PrismaModule } from './adapters/out/database/prisma.module';
import { KafkaModule } from './adapters/out/messaging/kafka.module';
import { OrderModule } from './order.module';

@Module({
  imports: [PrismaModule, KafkaModule, OrderModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
