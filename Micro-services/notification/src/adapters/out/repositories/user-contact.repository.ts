import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UserContact } from '../../../core/entities/user-contact.entity';
import {
  IUserContactRepository,
  UpsertUserContactInput,
} from '../../../core/interfaces/repositories/user-contact-repository.interface';

@Injectable()
export class UserContactRepository implements IUserContactRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<UserContact | null> {
    const row = await this.prisma.userContact.findUnique({ where: { userId } });
    return row ? new UserContact({ userId: row.userId, email: row.email, name: row.name }) : null;
  }

  async upsertWithInbox(
    eventId: string,
    eventType: string,
    input: UpsertUserContactInput,
  ): Promise<boolean> {
    let processedNow = false;

    await this.prisma.$transaction(async (tx) => {
      // dedupe: se já processamos esse eventId, no-op (ver ProcessedEvent inbox pattern)
      if (await tx.processedEvent.findUnique({ where: { eventId } })) return;

      await tx.userContact.upsert({
        where: { userId: input.userId },
        create: { userId: input.userId, email: input.email, name: input.name },
        update: { email: input.email, name: input.name },
      });

      await tx.processedEvent.create({ data: { eventId, eventType } });
      processedNow = true;
    });

    return processedNow;
  }
}
