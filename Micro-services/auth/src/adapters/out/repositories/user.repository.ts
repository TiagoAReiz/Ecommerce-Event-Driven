import { Injectable } from '@nestjs/common';
import { Prisma, User as PrismaUser } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { User, UserRole } from '../../../core/entities/user.entity';
import { EmailAlreadyInUseException } from '../../../core/exceptions/email-already-in-use.exception';
import {
  CreateOutboxEventInput,
  CreateUserInput,
  IUserRepository,
} from '../../../core/interfaces/repositories/user-repository.interface';

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
