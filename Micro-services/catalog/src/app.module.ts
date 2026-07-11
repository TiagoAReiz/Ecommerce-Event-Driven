import { Module } from '@nestjs/common';
import { PrismaModule } from './adapters/out/database/prisma.module';
import { KafkaModule } from './adapters/out/messaging/kafka.module';
import { CatalogModule } from './catalog.module';

@Module({
  imports: [PrismaModule, KafkaModule, CatalogModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
