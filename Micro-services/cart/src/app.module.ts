import { Module } from '@nestjs/common';
import { PrismaModule } from './adapters/out/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
