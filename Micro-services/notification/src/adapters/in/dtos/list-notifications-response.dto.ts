import { NotificationResponseDto } from './notification-response.dto';

export class ListNotificationsResponseDto {
  items!: NotificationResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
}
