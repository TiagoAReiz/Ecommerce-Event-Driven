import { Injectable } from '@nestjs/common';
import { Prisma, User as PrismaUser } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { User, UserRole } from '../../../core/entities/user.entity';
import { EmailAlreadyInUseException } from '../../../core/exceptions/email-already-in-use.exception';
import {
  IUserRepository,
  PromoteToSellerResult,
} from '../../../core/interfaces/repositories/user-repository.interface';
import { CreateUserInput } from '../../../core/interfaces/repositories/inputs/user-repository.inputs';
import { CreateOutboxEventInput } from '../../../core/interfaces/repositories/inputs/outbox-event.input';

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByGoogleId(googleId: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { googleId } });
    return row ? this.toEntity(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async updateProfile(id: string, data: { name: string; avatarUrl: string | null }): Promise<User> {
    const row = await this.prisma.user.update({ where: { id }, data });
    return this.toEntity(row);
  }

  async createWithEvent(user: CreateUserInput, event: CreateOutboxEventInput): Promise<User> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: user });
        await tx.outboxEvent.create({
          data: {
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            eventType: event.eventType,
            payload: event.payload as Prisma.InputJsonValue,
          },
        });
        return created;
      });
      return this.toEntity(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new EmailAlreadyInUseException();
      }
      throw error;
    }
  }

  async promoteToSellerWithInbox(
    eventId: string,
    eventType: string,
    userId: string,
  ): Promise<PromoteToSellerResult> {
    return this.prisma.$transaction(async (tx): Promise<PromoteToSellerResult> => {
      // dedupe de inbox: se já processamos esse eventId, no-op (ProcessedEvent pattern)
      if (await tx.processedEvent.findUnique({ where: { eventId } })) {
        return { outcome: 'DEDUPED' };
      }

      const user = await tx.user.findUnique({ where: { id: userId } });
      // Usuário desconhecido: marca como processado assim mesmo pra não reentregar em loop
      // (anomalia — o auth é a fonte dos usuários; o service loga um warning).
      if (!user) {
        await tx.processedEvent.create({ data: { eventId, eventType } });
        return { outcome: 'USER_NOT_FOUND' };
      }

      if (user.role === 'SELLER') {
        await tx.processedEvent.create({ data: { eventId, eventType } });
        return { outcome: 'ALREADY_SELLER' };
      }

      const oldRole = user.role as UserRole;
      await tx.user.update({ where: { id: userId }, data: { role: 'SELLER' } });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'User',
          aggregateId: userId,
          eventType: 'UserRoleChanged',
          payload: { userId, oldRole, newRole: 'SELLER' } as Prisma.InputJsonValue,
        },
      });
      await tx.processedEvent.create({ data: { eventId, eventType } });
      return { outcome: 'PROMOTED', oldRole };
    });
  }

  private toEntity(row: PrismaUser): User {
    return new User({
      id: row.id,
      googleId: row.googleId,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatarUrl,
      role: row.role as UserRole,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
