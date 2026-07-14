import { Module } from '@nestjs/common';
import { PrismaModule } from './adapters/out/database/prisma.module';
import { ReviewModule } from './review.module';
import { KafkaModule } from './adapters/out/messaging/kafka/kafka.module';

@Module({
    imports: [ReviewModule, PrismaModule, KafkaModule],
    controllers: [],
    providers: [],
})
export class AppModule { }
