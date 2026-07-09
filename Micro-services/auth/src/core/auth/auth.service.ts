import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../adapters/out/database/prisma.service';
import { GoogleOAuthService, GoogleProfile } from './google-oauth.service';
import { TokenPair, TokenService } from './token.service';

export interface LoginResult extends TokenPair {
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    role: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly tokenService: TokenService,
  ) {}

  buildGoogleAuthUrl(state: string): string {
    return this.googleOAuth.buildAuthUrl(state);
  }

  async loginWithGoogleCode(code: string): Promise<LoginResult> {
    const profile = await this.googleOAuth.exchangeCodeForProfile(code);
    const user = await this.upsertUserAndPublishIfNew(profile);
    const tokens = await this.tokenService.issueTokenPair({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
      },
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
    const { sub } = await this.tokenService.verifyRefreshToken(refreshToken);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: sub } });
    const { accessToken } = await this.tokenService.issueTokenPair({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return { accessToken };
  }

  private async upsertUserAndPublishIfNew(profile: GoogleProfile) {
    const existing = await this.prisma.user.findUnique({ where: { googleId: profile.googleId } });

    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: { name: profile.name, avatarUrl: profile.avatarUrl },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          googleId: profile.googleId,
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
        },
      });

      await tx.outboxEvent.create({
        data: {
          aggregateType: 'User',
          aggregateId: user.id,
          eventType: 'UserRegistered',
          payload: { userId: user.id, email: user.email, name: user.name, role: user.role },
        },
      });

      return user;
    });
  }
}
