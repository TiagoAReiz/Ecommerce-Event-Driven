import { Inject, Injectable } from '@nestjs/common';
import { NOTIFICATION_REPOSITORY } from '../../core/interfaces/repositories/notification-repository.interface';
import type {
  INotificationRepository,
  PaginatedResult,
} from '../../core/interfaces/repositories/notification-repository.interface';
import { Notification } from '../../core/entities/notification.entity';
import { INotificationQueryService } from '../../core/interfaces/services/notification-query.service.interface';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class NotificationQueryService implements INotificationQueryService {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly notificationRepository: INotificationRepository,
  ) {}

  async listByUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<Notification>> {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : DEFAULT_PAGE;
    const safeLimit =
      Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), MAX_LIMIT) : DEFAULT_LIMIT;

    return this.notificationRepository.listByUser(userId, safePage, safeLimit);
  }
}
