import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    let profile: GoogleProfile;
    try {
      profile = await this.googleOAuth.exchangeCodeForProfile(code);
    } catch {
      throw new BadRequestException('Google authentication failed');
    }

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
    let sub: string;
    try {
      ({ sub } = await this.tokenService.verifyRefreshToken(refreshToken));
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    let user: { id: string; email: string; role: string };
    try {
      user = await this.prisma.user.findUniqueOrThrow({ where: { id: sub } });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

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

    try {
      return await this.prisma.$transaction(async (tx) => {
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
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
  }
}
