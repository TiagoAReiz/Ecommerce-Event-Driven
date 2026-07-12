import { Notification } from '../../core/entities/notification.entity';
import { PaginatedResult } from '../../core/interfaces/repositories/notification-repository.interface';
import { ListNotificationsResponseDto } from '../../adapters/in/dtos/list-notifications-response.dto';
import { NotificationResponseDto } from '../../adapters/in/dtos/notification-response.dto';

export class NotificationMapper {
  static toResponse(notification: Notification): NotificationResponseDto {
    return {
      id: notification.id,
      type: notification.type,
      recipientEmail: notification.recipientEmail,
      subject: notification.subject,
      status: notification.status,
      sentAt: notification.sentAt ? notification.sentAt.toISOString() : null,
      createdAt: notification.createdAt.toISOString(),
    };
  }

  static toListResponse(result: PaginatedResult<Notification>): ListNotificationsResponseDto {
    return {
      items: result.items.map(NotificationMapper.toResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }
}
