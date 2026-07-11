import { Notification } from '../../entities/notification.entity';
import { PaginatedResult } from '../repositories/notification-repository.interface';

export const NOTIFICATION_QUERY_SERVICE = Symbol('NOTIFICATION_QUERY_SERVICE');

export interface INotificationQueryService {
  listByUser(userId: string, page: number, limit: number): Promise<PaginatedResult<Notification>>;
}
