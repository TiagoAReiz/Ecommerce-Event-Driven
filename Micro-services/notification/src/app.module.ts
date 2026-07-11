import { Module } from '@nestjs/common';
import { PrismaModule } from './adapters/out/database/prisma.module';
import { KafkaModule } from './adapters/out/messaging/kafka.module';
import { NotificationModule } from './notification.module';

@Module({
  imports: [PrismaModule, KafkaModule, NotificationModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
