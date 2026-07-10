import { User } from '../../entities/user.entity';
import { TokenPair } from './token-service.interface';

export const AUTH_SERVICE = Symbol('AUTH_SERVICE');

export interface LoginResult extends TokenPair {
  user: User;
}

export interface IAuthService {
  buildGoogleAuthUrl(state: string): string;
  loginWithGoogleCode(code: string): Promise<LoginResult>;
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }>;
}
