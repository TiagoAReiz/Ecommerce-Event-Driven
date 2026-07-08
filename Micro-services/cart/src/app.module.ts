import { Module } from '@nestjs/common';
import { PrismaModule } from './adapters/out/database/prisma.module';
import { KafkaModule } from './adapters/out/messaging/kafka.module';

@Module({
  imports: [PrismaModule, KafkaModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
