# Auth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `Micro-services/auth` from an empty NestJS/Prisma skeleton into a working authentication
service: Google OAuth login, stateless JWT issuance/refresh, a reusable auth guard, `GET /users/me`,
and a Transactional Outbox relay that actually publishes `UserRegistered` to Kafka.

**Architecture:** Hexagonal, following the `adapters/out/{database,messaging}` split already in the
repo. Business logic lives in `src/core/auth/` (framework-light services); HTTP concerns live in
`src/adapters/in/http/` (controllers, guard, DTOs). No new inter-service calls in this plan — auth is
fully self-contained.

**Tech Stack:** NestJS 11, Prisma 7 (`@prisma/adapter-pg`), `@confluentinc/kafka-javascript` (already
wired), adding `@nestjs/jwt`, `@nestjs/schedule`, `google-auth-library`. Jest + `ts-jest` for unit
specs (`src/**/*.spec.ts`), Jest + Supertest for e2e specs (`test/*.e2e-spec.ts`, real Postgres via
`docker compose up -d auth-db`).

## Global Constraints

These come from `docs/superpowers/specs/2026-07-08-api-endpoints-and-events-design.md` and
`docs/superpowers/specs/2026-07-08-microservices-db-schema-design.md`. Every task below implicitly
follows them:

- API prefix: every route is served under `/api/v1` (set once via `app.setGlobalPrefix('api/v1')` in
  `main.ts` — controllers themselves use bare paths like `auth`, `users`).
- Auth: JWT is **stateless** — no service calls auth-service synchronously to validate a token. Access
  token ~15min (`JWT_ACCESS_SECRET`), refresh token ~7 days (`JWT_REFRESH_SECRET`), both HS256 via
  `@nestjs/jwt`. Header: `Authorization: Bearer <token>`.
  Access token payload: `{ sub: userId, email, role }`.
- Authorization: role in the JWT is only a coarse gate. There is no ownership check needed in this
  plan (auth-service only ever reads/writes the requester's own `User` row by `sub`), but the guard
  built here is the template every other service's plan will copy.
  Refresh token revocation/blacklisting is explicitly **out of scope** (see design doc) — logout is
  client-side token discard.
- Transactional Outbox: any state change that must publish an event writes the `OutboxEvent` row in
  the **same Prisma transaction** as the state change (`prisma.$transaction`), never as a separate
  write after the fact.
- Event envelope (wire format, JSON-stringified as the Kafka message value):
  `{ eventId: uuid, eventType, aggregateType, aggregateId, occurredAt, version, payload }`. Kafka
  message **key** is always the `aggregateId`. Auth publishes to the single topic `auth-events`.
- No API Gateway exists — this guard is deployed independently in every service in later plans, not
  shared as an npm package (documented follow-up, not a task here).

---

### Task 1: Add missing index on `OutboxEvent.status`

`docs/STATE.md` already tracks "nenhum serviço tem `@@index` em `OutboxEvent.status`" as a known
debt, to be resolved "junto com a implementação do outbox-relay". Task 9 below implements the auth
relay, so this is the moment to fix it for auth-db.

**Files:**
- Modify: `Micro-services/auth/prisma/schema.prisma`
- Create: new migration folder under `Micro-services/auth/prisma/migrations/`

**Interfaces:**
- Produces: no code-level interface — this only affects query performance for Task 9's
  `WHERE status = 'PENDING'` poll.

- [ ] **Step 1: Add the index to the schema**

Edit `Micro-services/auth/prisma/schema.prisma`, changing the `OutboxEvent` model:

```prisma
model OutboxEvent {
  id            String       @id @default(uuid())
  aggregateType String
  aggregateId   String
  eventType     String
  payload       Json
  status        OutboxStatus @default(PENDING)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  publishedAt   DateTime?

  @@index([status])
}
```

- [ ] **Step 2: Start the auth Postgres container**

Run: `docker compose up -d auth-db` (from the repo root, `/home/tiago/workfolder/Ecommerce-Event-Driven`)
Expected: container `auth-db` becomes healthy (`docker compose ps auth-db` shows `healthy`).

- [ ] **Step 3: Generate and apply the migration**

Run (from `Micro-services/auth`): `npx prisma migrate dev --name add_outbox_status_index`
Expected: a new folder `prisma/migrations/<timestamp>_add_outbox_status_index/migration.sql`
containing `CREATE INDEX "OutboxEvent_status_idx" ON "OutboxEvent"("status");`, and the command exits
0.

- [ ] **Step 4: Commit**

```bash
cd /home/tiago/workfolder/Ecommerce-Event-Driven
git add Micro-services/auth/prisma/schema.prisma Micro-services/auth/prisma/migrations
git commit -m "fix(auth): add index on OutboxEvent.status for the relay poll"
```

---

### Task 2: Install new dependencies and add required env vars

**Files:**
- Modify: `Micro-services/auth/package.json` (via npm install)
- Modify: `Micro-services/auth/.env`

**Interfaces:**
- Produces: `@nestjs/jwt`, `@nestjs/schedule`, `google-auth-library` available to import in every
  later task; the six env vars below available via `process.env`.

- [ ] **Step 1: Install dependencies**

Run (from `Micro-services/auth`): `npm install @nestjs/jwt@^11 @nestjs/schedule@^6 google-auth-library@^10`
Expected: `package.json` `dependencies` gains the three packages; exits 0.

- [ ] **Step 2: Append the new env vars**

Edit `Micro-services/auth/.env`, appending:

```
# Google OAuth (create credentials at https://console.cloud.google.com/apis/credentials)
GOOGLE_CLIENT_ID="replace-with-google-oauth-client-id"
GOOGLE_CLIENT_SECRET="replace-with-google-oauth-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:3000/api/v1/auth/google/callback"

# JWT
JWT_ACCESS_SECRET="dev-access-secret-change-me"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_SECRET="dev-refresh-secret-change-me"
JWT_REFRESH_EXPIRES_IN="7d"
```

- [ ] **Step 3: Commit**

```bash
cd /home/tiago/workfolder/Ecommerce-Event-Driven
git add Micro-services/auth/package.json Micro-services/auth/package-lock.json Micro-services/auth/.env
git commit -m "chore(auth): add JWT, schedule and Google OAuth dependencies"
```

---

### Task 3: `TokenService` — sign and verify access/refresh JWTs

**Files:**
- Create: `Micro-services/auth/src/core/auth/token.service.ts`
- Test: `Micro-services/auth/src/core/auth/token.service.spec.ts`

**Interfaces:**
- Consumes: `JwtService` from `@nestjs/jwt` (constructor-injected, instantiated directly as
  `new JwtService()` in tests — it has no external dependencies).
- Produces (used by Tasks 4, 6, 8):
  - `interface AccessTokenPayload { sub: string; email: string; role: string }`
  - `interface TokenPair { accessToken: string; refreshToken: string }`
  - `class TokenService { issueTokenPair(payload: AccessTokenPayload): Promise<TokenPair>; verifyAccessToken(token: string): Promise<AccessTokenPayload>; verifyRefreshToken(token: string): Promise<{ sub: string }> }`

- [ ] **Step 1: Write the failing test**

Create `Micro-services/auth/src/core/auth/token.service.spec.ts`:

```typescript
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';

describe('TokenService', () => {
  let tokenService: TokenService;

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  });

  beforeEach(() => {
    tokenService = new TokenService(new JwtService());
  });

  it('issues an access token that verifies back to the same payload', async () => {
    const { accessToken } = await tokenService.issueTokenPair({
      sub: 'user-1',
      email: 'user@example.com',
      role: 'CUSTOMER',
    });

    const decoded = await tokenService.verifyAccessToken(accessToken);

    expect(decoded.sub).toBe('user-1');
    expect(decoded.email).toBe('user@example.com');
    expect(decoded.role).toBe('CUSTOMER');
  });

  it('issues a refresh token that verifies back to the same subject', async () => {
    const { refreshToken } = await tokenService.issueTokenPair({
      sub: 'user-1',
      email: 'user@example.com',
      role: 'CUSTOMER',
    });

    const decoded = await tokenService.verifyRefreshToken(refreshToken);

    expect(decoded.sub).toBe('user-1');
  });

  it('rejects an access token verified with the wrong secret', async () => {
    const { accessToken } = await tokenService.issueTokenPair({
      sub: 'user-1',
      email: 'user@example.com',
      role: 'CUSTOMER',
    });

    process.env.JWT_ACCESS_SECRET = 'a-different-secret';

    await expect(tokenService.verifyAccessToken(accessToken)).rejects.toThrow();

    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  });

  it('rejects a refresh token verified as an access token', async () => {
    const { refreshToken } = await tokenService.issueTokenPair({
      sub: 'user-1',
      email: 'user@example.com',
      role: 'CUSTOMER',
    });

    await expect(tokenService.verifyAccessToken(refreshToken)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd Micro-services/auth && npx jest token.service.spec.ts`
Expected: FAIL — `Cannot find module './token.service'`.

- [ ] **Step 3: Implement `TokenService`**

Create `Micro-services/auth/src/core/auth/token.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  async issueTokenPair(payload: AccessTokenPayload): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
      }),
      this.jwtService.signAsync(
        { sub: payload.sub },
        {
          secret: process.env.JWT_REFRESH_SECRET,
          expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwtService.verifyAsync<AccessTokenPayload>(token, {
      secret: process.env.JWT_ACCESS_SECRET,
    });
  }

  async verifyRefreshToken(token: string): Promise<{ sub: string }> {
    return this.jwtService.verifyAsync<{ sub: string }>(token, {
      secret: process.env.JWT_REFRESH_SECRET,
    });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Micro-services/auth && npx jest token.service.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/tiago/workfolder/Ecommerce-Event-Driven
git add Micro-services/auth/src/core/auth/token.service.ts Micro-services/auth/src/core/auth/token.service.spec.ts
git commit -m "feat(auth): add TokenService for access/refresh JWT issuance"
```

---

### Task 4: `JwtAuthGuard` — protects routes using `TokenService`

**Files:**
- Create: `Micro-services/auth/src/adapters/in/http/jwt-auth.guard.ts`
- Create: `Micro-services/auth/src/adapters/in/http/express.d.ts`
- Test: `Micro-services/auth/src/adapters/in/http/jwt-auth.guard.spec.ts`

**Interfaces:**
- Consumes: `TokenService.verifyAccessToken` from Task 3.
- Produces (used by Tasks 6, 8): `class JwtAuthGuard implements CanActivate`, and the augmented
  Express `Request.user?: AccessTokenPayload` type used by every protected controller.

- [ ] **Step 1: Write the failing test**

Create `Micro-services/auth/src/adapters/in/http/jwt-auth.guard.spec.ts`:

```typescript
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TokenService } from '../../../core/auth/token.service';

function mockContext(headers: Record<string, string>): ExecutionContext {
  const request: any = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  it('allows the request and attaches the decoded payload when the token is valid', async () => {
    const tokenService = {
      verifyAccessToken: jest
        .fn()
        .mockResolvedValue({ sub: 'user-1', email: 'a@b.com', role: 'CUSTOMER' }),
    } as unknown as TokenService;
    const guard = new JwtAuthGuard(tokenService);
    const context = mockContext({ authorization: 'Bearer valid-token' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(context.switchToHttp().getRequest().user).toEqual({
      sub: 'user-1',
      email: 'a@b.com',
      role: 'CUSTOMER',
    });
  });

  it('rejects when there is no Authorization header', async () => {
    const tokenService = { verifyAccessToken: jest.fn() } as unknown as TokenService;
    const guard = new JwtAuthGuard(tokenService);
    const context = mockContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a header that is not a Bearer token', async () => {
    const tokenService = { verifyAccessToken: jest.fn() } as unknown as TokenService;
    const guard = new JwtAuthGuard(tokenService);
    const context = mockContext({ authorization: 'Basic dXNlcjpwYXNz' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the token fails verification', async () => {
    const tokenService = {
      verifyAccessToken: jest.fn().mockRejectedValue(new Error('bad token')),
    } as unknown as TokenService;
    const guard = new JwtAuthGuard(tokenService);
    const context = mockContext({ authorization: 'Bearer bad-token' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd Micro-services/auth && npx jest jwt-auth.guard.spec.ts`
Expected: FAIL — `Cannot find module './jwt-auth.guard'`.

- [ ] **Step 3: Implement the guard and the Express type augmentation**

Create `Micro-services/auth/src/adapters/in/http/express.d.ts`:

```typescript
import { AccessTokenPayload } from '../../../core/auth/token.service';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export {};
```

Create `Micro-services/auth/src/adapters/in/http/jwt-auth.guard.ts`:

```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { TokenService } from '../../../core/auth/token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      request.user = await this.tokenService.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return true;
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    return header.slice('Bearer '.length);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Micro-services/auth && npx jest jwt-auth.guard.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/tiago/workfolder/Ecommerce-Event-Driven
git add Micro-services/auth/src/adapters/in/http/jwt-auth.guard.ts Micro-services/auth/src/adapters/in/http/jwt-auth.guard.spec.ts Micro-services/auth/src/adapters/in/http/express.d.ts
git commit -m "feat(auth): add JwtAuthGuard for protected routes"
```

---

### Task 5: `GoogleOAuthService` — code exchange and profile extraction

**Files:**
- Create: `Micro-services/auth/src/core/auth/google-oauth.service.ts`
- Test: `Micro-services/auth/src/core/auth/google-oauth.service.spec.ts`

**Interfaces:**
- Consumes: `OAuth2Client` from `google-auth-library`.
- Produces (used by Task 7):
  - `interface GoogleProfile { googleId: string; email: string; name: string; avatarUrl: string | null }`
  - `class GoogleOAuthService { buildAuthUrl(state: string): string; exchangeCodeForProfile(code: string): Promise<GoogleProfile> }`

- [ ] **Step 1: Write the failing test**

Create `Micro-services/auth/src/core/auth/google-oauth.service.spec.ts`:

```typescript
import { OAuth2Client } from 'google-auth-library';
import { GoogleOAuthService } from './google-oauth.service';

jest.mock('google-auth-library');

describe('GoogleOAuthService', () => {
  let generateAuthUrl: jest.Mock;
  let getToken: jest.Mock;
  let verifyIdToken: jest.Mock;
  let service: GoogleOAuthService;

  beforeEach(() => {
    generateAuthUrl = jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mock=1');
    getToken = jest.fn();
    verifyIdToken = jest.fn();

    (OAuth2Client as unknown as jest.Mock).mockImplementation(() => ({
      generateAuthUrl,
      getToken,
      verifyIdToken,
    }));

    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/v1/auth/google/callback';

    service = new GoogleOAuthService();
  });

  it('builds the Google consent URL with the requested scopes and state', () => {
    const url = service.buildAuthUrl('state-123');

    expect(generateAuthUrl).toHaveBeenCalledWith({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      state: 'state-123',
    });
    expect(url).toBe('https://accounts.google.com/o/oauth2/v2/auth?mock=1');
  });

  it('exchanges a code for a normalized Google profile', async () => {
    getToken.mockResolvedValue({ tokens: { id_token: 'id-token-value' } });
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-sub-1',
        email: 'user@example.com',
        name: 'User Name',
        picture: 'https://example.com/avatar.png',
      }),
    });

    const profile = await service.exchangeCodeForProfile('auth-code');

    expect(getToken).toHaveBeenCalledWith('auth-code');
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'id-token-value',
      audience: 'client-id',
    });
    expect(profile).toEqual({
      googleId: 'google-sub-1',
      email: 'user@example.com',
      name: 'User Name',
      avatarUrl: 'https://example.com/avatar.png',
    });
  });

  it('throws when Google does not return an id_token', async () => {
    getToken.mockResolvedValue({ tokens: {} });

    await expect(service.exchangeCodeForProfile('auth-code')).rejects.toThrow(
      'Google did not return an id_token',
    );
  });

  it('throws when the id_token payload is missing required claims', async () => {
    getToken.mockResolvedValue({ tokens: { id_token: 'id-token-value' } });
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ email: 'user@example.com' }) });

    await expect(service.exchangeCodeForProfile('auth-code')).rejects.toThrow(
      'Google id_token payload is missing required claims',
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd Micro-services/auth && npx jest google-oauth.service.spec.ts`
Expected: FAIL — `Cannot find module './google-oauth.service'`.

- [ ] **Step 3: Implement `GoogleOAuthService`**

Create `Micro-services/auth/src/core/auth/google-oauth.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

@Injectable()
export class GoogleOAuthService {
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Micro-services/auth && npx jest google-oauth.service.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/tiago/workfolder/Ecommerce-Event-Driven
git add Micro-services/auth/src/core/auth/google-oauth.service.ts Micro-services/auth/src/core/auth/google-oauth.service.spec.ts
git commit -m "feat(auth): add GoogleOAuthService for code exchange"
```

---

### Task 6: `AuthService` — login orchestration + transactional outbox write

**Files:**
- Create: `Micro-services/auth/src/core/auth/auth.service.ts`
- Test: `Micro-services/auth/src/core/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (`Micro-services/auth/src/adapters/out/database/prisma.service.ts`,
  exposes `user.findUnique/update/findUniqueOrThrow` and `$transaction` per the generated Prisma
  client for the `User`/`OutboxEvent` models already in `schema.prisma`), `GoogleOAuthService` (Task
  5), `TokenService` (Task 3).
- Produces (used by Task 8):
  - `interface LoginResult extends TokenPair { user: { id: string; email: string; name: string; avatarUrl: string | null; role: string } }`
  - `class AuthService { buildGoogleAuthUrl(state: string): string; loginWithGoogleCode(code: string): Promise<LoginResult>; refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> }`

- [ ] **Step 1: Write the failing test**

Create `Micro-services/auth/src/core/auth/auth.service.spec.ts`:

```typescript
import { AuthService } from './auth.service';

function buildService() {
  const tx = {
    user: { create: jest.fn() },
    outboxEvent: { create: jest.fn() },
  };
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(tx)),
  } as any;
  const googleOAuth = { buildAuthUrl: jest.fn(), exchangeCodeForProfile: jest.fn() } as any;
  const tokenService = { issueTokenPair: jest.fn(), verifyRefreshToken: jest.fn() } as any;
  const service = new AuthService(prisma, googleOAuth, tokenService);
  return { service, prisma, tx, googleOAuth, tokenService };
}

describe('AuthService', () => {
  it('creates a new user and writes the UserRegistered outbox event in the same transaction, for a first-time Google login', async () => {
    const { service, prisma, tx, googleOAuth, tokenService } = buildService();
    prisma.user.findUnique.mockResolvedValue(null);
    tx.user.create.mockResolvedValue({
      id: 'user-1',
      googleId: 'g-1',
      email: 'a@b.com',
      name: 'Ana',
      avatarUrl: null,
      role: 'CUSTOMER',
    });
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
    googleOAuth.exchangeCodeForProfile.mockResolvedValue({
      googleId: 'g-1',
      email: 'a@b.com',
      name: 'Ana',
      avatarUrl: null,
    });

    const result = await service.loginWithGoogleCode('code-1');

    expect(tx.user.create).toHaveBeenCalledWith({
      data: { googleId: 'g-1', email: 'a@b.com', name: 'Ana', avatarUrl: null },
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        aggregateType: 'User',
        aggregateId: 'user-1',
        eventType: 'UserRegistered',
        payload: { userId: 'user-1', email: 'a@b.com', name: 'Ana', role: 'CUSTOMER' },
      },
    });
    expect(result.accessToken).toBe('at');
    expect(result.user.id).toBe('user-1');
  });

  it('updates an existing user without writing an outbox event, for a repeat Google login', async () => {
    const { service, prisma, tx, googleOAuth, tokenService } = buildService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      googleId: 'g-1',
      email: 'a@b.com',
      name: 'Old Name',
      avatarUrl: null,
      role: 'CUSTOMER',
    });
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      googleId: 'g-1',
      email: 'a@b.com',
      name: 'New Name',
      avatarUrl: 'pic',
      role: 'CUSTOMER',
    });
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
    googleOAuth.exchangeCodeForProfile.mockResolvedValue({
      googleId: 'g-1',
      email: 'a@b.com',
      name: 'New Name',
      avatarUrl: 'pic',
    });

    const result = await service.loginWithGoogleCode('code-1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'New Name', avatarUrl: 'pic' },
    });
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
    expect(result.user.name).toBe('New Name');
  });

  it('issues a new access token for a valid refresh token', async () => {
    const { service, prisma, tokenService } = buildService();
    tokenService.verifyRefreshToken.mockResolvedValue({ sub: 'user-1' });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'CUSTOMER' });
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'new-at', refreshToken: 'new-rt' });

    const result = await service.refreshAccessToken('valid-refresh');

    expect(result).toEqual({ accessToken: 'new-at' });
  });

  it('propagates the rejection for an invalid refresh token', async () => {
    const { service, tokenService } = buildService();
    tokenService.verifyRefreshToken.mockRejectedValue(new Error('invalid token'));

    await expect(service.refreshAccessToken('bad-token')).rejects.toThrow('invalid token');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd Micro-services/auth && npx jest auth.service.spec.ts`
Expected: FAIL — `Cannot find module './auth.service'`.

- [ ] **Step 3: Implement `AuthService`**

Create `Micro-services/auth/src/core/auth/auth.service.ts`:

```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Micro-services/auth && npx jest auth.service.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/tiago/workfolder/Ecommerce-Event-Driven
git add Micro-services/auth/src/core/auth/auth.service.ts Micro-services/auth/src/core/auth/auth.service.spec.ts
git commit -m "feat(auth): add AuthService with transactional UserRegistered outbox write"
```

---

### Task 7: `UsersController` — `GET /users/me`

**Files:**
- Create: `Micro-services/auth/src/adapters/in/http/users.controller.ts`
- Test: `Micro-services/auth/src/adapters/in/http/users.controller.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `JwtAuthGuard` (Task 4), the augmented `Request.user` (Task 4).
- Produces: `GET /users/me` route (mounted at `/api/v1/users/me` once `main.ts` sets the global
  prefix in Task 9).

- [ ] **Step 1: Write the failing test**

Create `Micro-services/auth/src/adapters/in/http/users.controller.spec.ts`:

```typescript
import { NotFoundException } from '@nestjs/common';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  it('returns the authenticated user profile', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'a@b.com',
          name: 'Ana',
          avatarUrl: null,
          role: 'CUSTOMER',
        }),
      },
    } as any;
    const controller = new UsersController(prisma);
    const request = { user: { sub: 'user-1', email: 'a@b.com', role: 'CUSTOMER' } } as any;

    const result = await controller.me(request);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    expect(result).toEqual({
      id: 'user-1',
      email: 'a@b.com',
      name: 'Ana',
      avatarUrl: null,
      role: 'CUSTOMER',
    });
  });

  it('throws NotFoundException when the user no longer exists', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null) } } as any;
    const controller = new UsersController(prisma);
    const request = { user: { sub: 'missing', email: 'x@y.com', role: 'CUSTOMER' } } as any;

    await expect(controller.me(request)).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd Micro-services/auth && npx jest users.controller.spec.ts`
Expected: FAIL — `Cannot find module './users.controller'`.

- [ ] **Step 3: Implement `UsersController`**

Create `Micro-services/auth/src/adapters/in/http/users.controller.ts`:

```typescript
import { Controller, Get, NotFoundException, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../out/database/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() request: Request) {
    const user = await this.prisma.user.findUnique({ where: { id: request.user!.sub } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
    };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Micro-services/auth && npx jest users.controller.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/tiago/workfolder/Ecommerce-Event-Driven
git add Micro-services/auth/src/adapters/in/http/users.controller.ts Micro-services/auth/src/adapters/in/http/users.controller.spec.ts
git commit -m "feat(auth): add GET /users/me"
```

---

### Task 8: `AuthController` — Google login endpoints + refresh

**Files:**
- Create: `Micro-services/auth/src/adapters/in/http/dto/refresh-token.dto.ts`
- Create: `Micro-services/auth/src/adapters/in/http/auth.controller.ts`
- Test: `Micro-services/auth/src/adapters/in/http/auth.controller.spec.ts`

**Interfaces:**
- Consumes: `AuthService` (Task 6).
- Produces: `GET /auth/google`, `GET /auth/google/callback`, `POST /auth/refresh` (mounted under
  `/api/v1/auth/...` once `main.ts` sets the global prefix in Task 9).

- [ ] **Step 1: Write the failing test**

Create `Micro-services/auth/src/adapters/in/http/auth.controller.spec.ts`:

```typescript
import { BadRequestException } from '@nestjs/common';
import { AuthController } from './auth.controller';

function buildController() {
  const authService = {
    buildGoogleAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/mock'),
    loginWithGoogleCode: jest.fn(),
    refreshAccessToken: jest.fn(),
  } as any;
  return { controller: new AuthController(authService), authService };
}

describe('AuthController', () => {
  it('redirects to the Google consent URL', () => {
    const { controller, authService } = buildController();
    const res = { redirect: jest.fn() } as any;

    controller.redirectToGoogle(res);

    expect(authService.buildGoogleAuthUrl).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('https://accounts.google.com/mock');
  });

  it('logs the user in with the code returned by Google', async () => {
    const { controller, authService } = buildController();
    authService.loginWithGoogleCode.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', user: {} });

    const result = await controller.googleCallback('auth-code');

    expect(authService.loginWithGoogleCode).toHaveBeenCalledWith('auth-code');
    expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt', user: {} });
  });

  it('rejects a refresh call with no refreshToken', async () => {
    const { controller } = buildController();

    await expect(controller.refresh({} as any)).rejects.toThrow(BadRequestException);
  });

  it('returns a new access token for a valid refreshToken', async () => {
    const { controller, authService } = buildController();
    authService.refreshAccessToken.mockResolvedValue({ accessToken: 'new-at' });

    const result = await controller.refresh({ refreshToken: 'rt' });

    expect(authService.refreshAccessToken).toHaveBeenCalledWith('rt');
    expect(result).toEqual({ accessToken: 'new-at' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd Micro-services/auth && npx jest auth.controller.spec.ts`
Expected: FAIL — `Cannot find module './auth.controller'`.

- [ ] **Step 3: Implement the DTO and `AuthController`**

Create `Micro-services/auth/src/adapters/in/http/dto/refresh-token.dto.ts`:

```typescript
export class RefreshTokenDto {
  refreshToken!: string;
}
```

Create `Micro-services/auth/src/adapters/in/http/auth.controller.ts`:

```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Micro-services/auth && npx jest auth.controller.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/tiago/workfolder/Ecommerce-Event-Driven
git add Micro-services/auth/src/adapters/in/http/dto Micro-services/auth/src/adapters/in/http/auth.controller.ts Micro-services/auth/src/adapters/in/http/auth.controller.spec.ts
git commit -m "feat(auth): add Google login and refresh endpoints"
```

---

### Task 9: `OutboxRelayService` — poll and publish to `auth-events`

**Files:**
- Create: `Micro-services/auth/src/core/auth/outbox-relay.service.ts`
- Test: `Micro-services/auth/src/core/auth/outbox-relay.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `KafkaProducerService`
  (`Micro-services/auth/src/adapters/out/messaging/kafka-producer.service.ts`, already exists —
  `publish(topic: string, messages: KafkaJS.Message[]): Promise<void>`), `@nestjs/schedule`'s
  `@Interval` decorator.
- Produces: `class OutboxRelayService { relayPendingEvents(): Promise<void> }`, running automatically
  every 5s once `AuthModule` (Task 10) imports `ScheduleModule.forRoot()`.

- [ ] **Step 1: Write the failing test**

Create `Micro-services/auth/src/core/auth/outbox-relay.service.spec.ts`:

```typescript
import { OutboxRelayService } from './outbox-relay.service';

function buildService() {
  const prisma = { outboxEvent: { findMany: jest.fn(), update: jest.fn() } } as any;
  const producer = { publish: jest.fn() } as any;
  const service = new OutboxRelayService(prisma, producer);
  return { service, prisma, producer };
}

describe('OutboxRelayService', () => {
  it('publishes each pending event to auth-events keyed by aggregateId and marks it PUBLISHED', async () => {
    const { service, prisma, producer } = buildService();
    const createdAt = new Date('2026-07-09T10:00:00.000Z');
    prisma.outboxEvent.findMany.mockResolvedValue([
      {
        id: 'evt-1',
        aggregateType: 'User',
        aggregateId: 'user-1',
        eventType: 'UserRegistered',
        payload: { userId: 'user-1' },
        createdAt,
      },
    ]);
    producer.publish.mockResolvedValue(undefined);

    await service.relayPendingEvents();

    expect(producer.publish).toHaveBeenCalledWith('auth-events', [
      expect.objectContaining({
        key: 'user-1',
        value: expect.stringContaining('"eventType":"UserRegistered"'),
      }),
    ]);
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { status: 'PUBLISHED', publishedAt: expect.any(Date) },
    });
  });

  it('leaves the event PENDING and does not throw when the Kafka publish fails', async () => {
    const { service, prisma, producer } = buildService();
    prisma.outboxEvent.findMany.mockResolvedValue([
      {
        id: 'evt-1',
        aggregateType: 'User',
        aggregateId: 'user-1',
        eventType: 'UserRegistered',
        payload: {},
        createdAt: new Date(),
      },
    ]);
    producer.publish.mockRejectedValue(new Error('broker unreachable'));

    await expect(service.relayPendingEvents()).resolves.toBeUndefined();
    expect(prisma.outboxEvent.update).not.toHaveBeenCalled();
  });

  it('does nothing when there are no pending events', async () => {
    const { service, prisma, producer } = buildService();
    prisma.outboxEvent.findMany.mockResolvedValue([]);

    await service.relayPendingEvents();

    expect(producer.publish).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd Micro-services/auth && npx jest outbox-relay.service.spec.ts`
Expected: FAIL — `Cannot find module './outbox-relay.service'`.

- [ ] **Step 3: Implement `OutboxRelayService`**

Create `Micro-services/auth/src/core/auth/outbox-relay.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../adapters/out/database/prisma.service';
import { KafkaProducerService } from '../../adapters/out/messaging/kafka-producer.service';

const AUTH_EVENTS_TOPIC = 'auth-events';
const POLL_BATCH_SIZE = 20;

interface OutboxRow {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
}

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly producer: KafkaProducerService,
  ) {}

  @Interval(5000)
  async relayPendingEvents(): Promise<void> {
    const pending = await this.prisma.outboxEvent.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: POLL_BATCH_SIZE,
    });

    for (const event of pending as OutboxRow[]) {
      await this.relayOne(event);
    }
  }

  private async relayOne(event: OutboxRow): Promise<void> {
    const envelope = {
      eventId: randomUUID(),
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      occurredAt: event.createdAt.toISOString(),
      version: 1,
      payload: event.payload,
    };

    try {
      await this.producer.publish(AUTH_EVENTS_TOPIC, [
        { key: event.aggregateId, value: JSON.stringify(envelope) },
      ]);
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(`Failed to relay outbox event ${event.id}`, error as Error);
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Micro-services/auth && npx jest outbox-relay.service.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/tiago/workfolder/Ecommerce-Event-Driven
git add Micro-services/auth/src/core/auth/outbox-relay.service.ts Micro-services/auth/src/core/auth/outbox-relay.service.spec.ts
git commit -m "feat(auth): add OutboxRelayService publishing to auth-events"
```

---

### Task 10: Wire `AuthModule`, set the global API prefix, and add e2e coverage

**Files:**
- Create: `Micro-services/auth/src/auth.module.ts`
- Modify: `Micro-services/auth/src/app.module.ts`
- Modify: `Micro-services/auth/src/main.ts`
- Create: `Micro-services/auth/test/auth.e2e-spec.ts`
- Create: `Micro-services/auth/test/users.e2e-spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–9.
- Produces: a fully wired, runnable auth-service with `/api/v1/auth/*` and `/api/v1/users/me` live.

- [ ] **Step 1: Create `AuthModule`**

Create `Micro-services/auth/src/auth.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthController } from './adapters/in/http/auth.controller';
import { UsersController } from './adapters/in/http/users.controller';
import { JwtAuthGuard } from './adapters/in/http/jwt-auth.guard';
import { AuthService } from './core/auth/auth.service';
import { GoogleOAuthService } from './core/auth/google-oauth.service';
import { TokenService } from './core/auth/token.service';
import { OutboxRelayService } from './core/auth/outbox-relay.service';

@Module({
  imports: [ScheduleModule.forRoot(), JwtModule.register({})],
  controllers: [AuthController, UsersController],
  providers: [AuthService, GoogleOAuthService, TokenService, JwtAuthGuard, OutboxRelayService],
})
export class AuthModule {}
```

`PrismaModule` and `KafkaModule` are both `@Global()` (already true in this codebase — see
`prisma.module.ts` and `kafka.module.ts`), so `PrismaService` and `KafkaProducerService` are
injectable here without being re-imported.

- [ ] **Step 2: Import `AuthModule` in `AppModule`**

Edit `Micro-services/auth/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from './adapters/out/database/prisma.module';
import { KafkaModule } from './adapters/out/messaging/kafka.module';
import { AuthModule } from './auth.module';

@Module({
  imports: [PrismaModule, KafkaModule, AuthModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 3: Set the global `/api/v1` prefix**

Edit `Micro-services/auth/src/main.ts`:

```typescript
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 4: Write the login + refresh e2e test**

This test stubs `GoogleOAuthService` (no real network call to Google) but exercises the real
`AuthModule` wiring against the real `auth-db` Postgres container, verifying the transactional
outbox write actually happens.

Create `Micro-services/auth/test/auth.e2e-spec.ts`:

```typescript
import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { GoogleOAuthService } from '../src/core/auth/google-oauth.service';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('Auth flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const googleId = `google-${randomUUID()}`;
  const email = `${randomUUID()}@example.com`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleOAuthService)
      .useValue({
        buildAuthUrl: () => 'https://accounts.google.com/mock',
        exchangeCodeForProfile: async () => ({
          googleId,
          email,
          name: 'E2E User',
          avatarUrl: null,
        }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: await userIds() } } });
    await prisma.user.deleteMany({ where: { googleId } });
    await app.close();
  });

  async function userIds(): Promise<string[]> {
    const users = await prisma.user.findMany({ where: { googleId }, select: { id: true } });
    return users.map((u) => u.id);
  }

  it('logs in with a Google code, creates the user, and writes a UserRegistered outbox event', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback')
      .query({ code: 'fake-code' })
      .expect(200);

    expect(response.body.user.email).toBe(email);
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();

    const outboxEvents = await prisma.outboxEvent.findMany({
      where: { eventType: 'UserRegistered', aggregateId: response.body.user.id },
    });
    expect(outboxEvents).toHaveLength(1);
    expect(outboxEvents[0].status).toBe('PENDING');
  });

  it('issues a new access token from the refresh token', async () => {
    const login = await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback')
      .query({ code: 'fake-code' })
      .expect(200);

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(201);

    expect(refreshed.body.accessToken).toBeDefined();
  });

  it('rejects refresh with a missing refreshToken', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({}).expect(400);
  });
});
```

- [ ] **Step 5: Write the `GET /users/me` e2e test**

Create `Micro-services/auth/test/users.e2e-spec.ts`:

```typescript
import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/adapters/out/database/prisma.service';
import { TokenService } from '../src/core/auth/token.service';

describe('GET /users/me (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
    tokenService = app.get(TokenService);

    const user = await prisma.user.create({
      data: {
        googleId: `google-${randomUUID()}`,
        email: `${randomUUID()}@example.com`,
        name: 'Profile User',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  it('returns 401 without a bearer token', async () => {
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
  });

  it('returns the profile for a valid access token', async () => {
    const { accessToken } = await tokenService.issueTokenPair({
      sub: userId,
      email: 'profile@example.com',
      role: 'CUSTOMER',
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.id).toBe(userId);
    expect(response.body.name).toBe('Profile User');
  });
});
```

- [ ] **Step 6: Run the full unit suite**

Run: `cd Micro-services/auth && npx jest`
Expected: PASS — all specs from Tasks 3–9 (18 tests) green.

- [ ] **Step 7: Run the e2e suite against the real `auth-db`**

Run: `docker compose up -d auth-db` (from repo root), then
`cd Micro-services/auth && npx jest --config ./test/jest-e2e.json`
Expected: PASS — `prisma.e2e-spec.ts` (existing), `auth.e2e-spec.ts`, `users.e2e-spec.ts` (6 new
tests) all green.

- [ ] **Step 8: Commit**

```bash
cd /home/tiago/workfolder/Ecommerce-Event-Driven
git add Micro-services/auth/src/auth.module.ts Micro-services/auth/src/app.module.ts Micro-services/auth/src/main.ts Micro-services/auth/test/auth.e2e-spec.ts Micro-services/auth/test/users.e2e-spec.ts
git commit -m "feat(auth): wire AuthModule, set /api/v1 prefix, add e2e coverage"
```

---

### Task 11: Update `docs/STATE.md`

**Files:**
- Modify: `docs/STATE.md`

- [ ] **Step 1: Update the status table and add a note**

In the "Status por serviço" table, change the `auth` row's `Kafka producers/consumers`, `Lógica de
negócio`, and `Integrações externas` columns. Add a `🟡 = parcial` entry to the legend line, since the
table only had ✅/⬜ before.

Old:
```
| auth | ✅ | ✅ | ✅ (3) | ⬜ | ⬜ | ⬜ Google OAuth |
```
```
✅ = feito e mergeado em `master` (2026-07-08) · ⬜ = não iniciado
```

New:
```
| auth | ✅ | ✅ | ✅ (3) | 🟡 (produtor) | ✅ (login + JWT) | ✅ Google OAuth |
```
```
✅ = feito e mergeado em `master` · ⬜ = não iniciado · 🟡 = parcial (ver nota abaixo)
```

Add, right after the table:

```markdown
🟡 **auth**: o outbox relay publica em `auth-events` (`UserRegistered`, `UserRoleChanged`), mas
auth ainda não tem nenhum **consumer** — o consumo de `SellerOnboarded` do catalog (pra promover
`User.role` a `SELLER`) só entra quando o plano de catalog+seller onboarding for implementado. Ver
`docs/superpowers/plans/2026-07-09-auth-foundation.md`.
```

- [ ] **Step 2: Commit**

```bash
cd /home/tiago/workfolder/Ecommerce-Event-Driven
git add docs/STATE.md
git commit -m "docs: mark auth foundation as implemented in project state"
```
