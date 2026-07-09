import { BadRequestException, Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../../../core/auth/auth.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google')
  redirectToGoogle(@Res() res: Response) {
    const url = this.authService.buildGoogleAuthUrl(randomUUID());
    res.redirect(url);
  }

  @Get('google/callback')
  async googleCallback(@Query('code') code: string) {
    return this.authService.loginWithGoogleCode(code);
  }

  @Post('refresh')
  async refresh(@Body() body: RefreshTokenDto) {
    if (!body?.refreshToken) {
      throw new BadRequestException('refreshToken is required');
    }
    return this.authService.refreshAccessToken(body.refreshToken);
  }
}
