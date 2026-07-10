import { BadRequestException, Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../../../core/auth/auth.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';

const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_COOKIE_MAX_AGE_MS = 5 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google')
  redirectToGoogle(@Res() res: Response) {
    const state = randomUUID();
    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      maxAge: OAUTH_STATE_COOKIE_MAX_AGE_MS,
      sameSite: 'lax',
    });
    const url = this.authService.buildGoogleAuthUrl(state);
    res.redirect(url);
  }

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieState: string | undefined = req.cookies?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE);

    if (!state || !cookieState || state !== cookieState) {
      throw new BadRequestException('Invalid or missing OAuth state');
    }

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
