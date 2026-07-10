export const GOOGLE_OAUTH_SERVICE = Symbol('GOOGLE_OAUTH_SERVICE');

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface IGoogleOAuthService {
  buildAuthUrl(state: string): string;
  exchangeCodeForProfile(code: string): Promise<GoogleProfile>;
}
