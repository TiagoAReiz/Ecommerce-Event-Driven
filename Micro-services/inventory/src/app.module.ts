import { Module } from '@nestjs/common';
import { PrismaModule } from './adapters/out/database/prisma.module';
import { KafkaModule } from './adapters/out/messaging/kafka.module';
import { InventoryModule } from './inventory.module';

@Module({
  imports: [PrismaModule, KafkaModule, InventoryModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
