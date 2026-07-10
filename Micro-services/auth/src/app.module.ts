import { Module } from '@nestjs/common';
import { PrismaModule } from './adapters/out/database/prisma.module';
import { KafkaModule } from './adapters/out/messaging/kafka.module';
import { AuthModule } from './auth.module';

@Module({
  imports: [PrismaModule, KafkaModule, AuthModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
