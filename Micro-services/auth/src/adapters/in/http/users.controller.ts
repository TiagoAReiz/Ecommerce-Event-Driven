import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { USER_SERVICE } from '../../../core/interfaces/services/user-service.interface';
import type { IUserService } from '../../../core/interfaces/services/user-service.interface';
import { UserMapper } from '../../../application/mappers/user.mapper';
import type { UserResponseDto } from '../dtos/user-response.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(@Inject(USER_SERVICE) private readonly userService: IUserService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() request: Request): Promise<UserResponseDto> {
    const user = await this.userService.getProfile(request.user!.sub);
    return UserMapper.toResponse(user);
  }
}
