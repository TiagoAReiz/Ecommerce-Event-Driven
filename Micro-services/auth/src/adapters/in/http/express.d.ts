import { AccessTokenPayload } from '../../../core/auth/token.service';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export {};
