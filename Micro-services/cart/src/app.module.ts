import { Module } from '@nestjs/common';
import { PrismaModule } from './adapters/out/database/prisma.module';
import { CartModule } from './cart.module';

// cart-service não usa Kafka (sem eventos, só API síncrona) — ver spec
// docs/superpowers/specs/2026-07-08-api-endpoints-and-events-design.md, seção cart-service.
@Module({
  imports: [PrismaModule, CartModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
