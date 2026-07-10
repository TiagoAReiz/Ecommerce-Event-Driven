import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import {
  GoogleProfile,
  IGoogleOAuthService,
} from '../../../core/interfaces/external/google-oauth.interface';

@Injectable()
export class GoogleOAuthService implements IGoogleOAuthService {
  private readonly client: OAuth2Client;

  constructor() {
    this.client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
  }

  buildAuthUrl(state: string): string {
    return this.client.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      state,
    });
  }

  async exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
    const { tokens } = await this.client.getToken(code);
    if (!tokens.id_token) {
      throw new Error('Google did not return an id_token');
    }

    const ticket = await this.client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new Error('Google id_token payload is missing required claims');
    }

    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name ?? payload.email,
      avatarUrl: payload.picture ?? null,
    };
  }
}
