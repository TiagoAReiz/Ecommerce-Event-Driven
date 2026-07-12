import { Injectable } from '@nestjs/common';
import { NotificationLog as PrismaNotificationLog } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { Notification, NotificationStatus, NotificationType } from '../../../core/entities/notification.entity';
import {
  INotificationRepository,
  PaginatedResult,
} from '../../../core/interfaces/repositories/notification-repository.interface';
import { CreatePendingNotificationInput } from '../../../core/interfaces/repositories/inputs/notification-repository.inputs';

@Injectable()
export class NotificationRepository implements INotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createPendingWithInbox(
    eventId: string,
    eventType: string,
    input: CreatePendingNotificationInput,
  ): Promise<Notification | null> {
    return this.prisma.$transaction(async (tx) => {
      // dedupe: se já processamos esse eventId, no-op (ver ProcessedEvent inbox pattern)
      if (await tx.processedEvent.findUnique({ where: { eventId } })) return null;

      const row = await tx.notificationLog.create({
        data: {
          userId: input.userId,
          type: input.type,
          recipientEmail: input.recipientEmail,
          subject: input.subject,
        },
      });

      await tx.processedEvent.create({ data: { eventId, eventType } });

      return this.toEntity(row);
    });
  }

  async markSent(id: string, sentAt: Date): Promise<void> {
    await this.prisma.notificationLog.update({ where: { id }, data: { status: 'SENT', sentAt } });
  }

  async markFailed(id: string): Promise<void> {
    await this.prisma.notificationLog.update({ where: { id }, data: { status: 'FAILED' } });
  }

  async listByUser(userId: string, page: number, limit: number): Promise<PaginatedResult<Notification>> {
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notificationLog.count({ where: { userId } }),
    ]);

    return { items: rows.map((row) => this.toEntity(row)), total, page, limit };
  }

  private toEntity(row: PrismaNotificationLog): Notification {
    return new Notification({
      id: row.id,
      userId: row.userId,
      type: row.type as NotificationType,
      recipientEmail: row.recipientEmail,
      subject: row.subject,
      status: row.status as NotificationStatus,
      sentAt: row.sentAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
