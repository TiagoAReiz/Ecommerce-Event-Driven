import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { NOTIFICATION_QUERY_SERVICE } from '../../../core/interfaces/services/notification-query.service.interface';
import type { INotificationQueryService } from '../../../core/interfaces/services/notification-query.service.interface';
import { NotificationMapper } from '../../../application/mappers/notification.mapper';
import type { ListNotificationsResponseDto } from '../dtos/list-notifications-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject(NOTIFICATION_QUERY_SERVICE)
    private readonly notificationQueryService: INotificationQueryService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(
    @Req() request: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<ListNotificationsResponseDto> {
    const result = await this.notificationQueryService.listByUser(
      request.user!.sub,
      page ? Number(page) : NaN,
      limit ? Number(limit) : NaN,
    );
    return NotificationMapper.toListResponse(result);
  }
}
