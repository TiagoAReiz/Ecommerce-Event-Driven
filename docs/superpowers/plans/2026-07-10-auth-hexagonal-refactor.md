# Auth Hexagonal Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar `Micro-services/auth` para a convenção de pastas hexagonal definida em
`docs/superpowers/specs/2026-07-10-hexagonal-folder-structure-design.md`, sem nenhuma mudança de
comportamento externo (rotas, status codes, shapes, envelope Kafka idênticos).

**Architecture:** Introduzir `core/{entities,exceptions,interfaces}` (puro, com Symbols de DI),
`application/{services,mappers}` (toda a lógica), `adapters/in/{controllers/guards,filters,dtos}` e
`adapters/out/{repositories,external}`. Estratégia: aditivo primeiro (core → adapters/out), depois
cutover por camada, cada task terminando com a suíte inteira verde.

**Tech Stack:** NestJS 11, Prisma 7, `@confluentinc/kafka-javascript`, Jest/ts-jest, Supertest.
Infra necessária pros e2e: containers `auth-db` (localhost:5433) e `kafka` (localhost:9094) —
`docker compose up -d auth-db kafka` a partir da raiz do repo.

## Global Constraints

Copiadas do spec — valem para TODAS as tasks:

- **Direção de dependência:** `core` não importa nada de application/adapters (nem `@nestjs/common`);
  `application` importa só `core` (+ libs in-process: `@nestjs/jwt`, `@nestjs/common` para
  `@Injectable`/`@Inject`/`Logger`, `@nestjs/schedule`, `node:crypto`) — exceção única e deliberada:
  `application/mappers` importa DTOs de `adapters/in/dtos`; `adapters/in` chama services **via
  Symbol** (`@Inject(AUTH_SERVICE)`), nunca classe concreta; `adapters/out` é o único lugar que toca
  Prisma/Kafka/Google.
- **Tokens de DI:** todo arquivo de interface exporta também um `Symbol` (ex:
  `export const AUTH_SERVICE = Symbol('AUTH_SERVICE')`). Binding no `auth.module.ts` via
  `{ provide: AUTH_SERVICE, useClass: AuthService }`.
- **Mensagens de exceção EXATAS** (preservam o body das respostas HTTP atuais):
  `InvalidRefreshTokenException` → `'Invalid or expired refresh token'` (401),
  `GoogleAuthenticationFailedException` → `'Google authentication failed'` (400),
  `EmailAlreadyInUseException` → `'An account with this email already exists'` (409),
  `UserNotFoundException` → `'User not found'` (404).
- **Invariantes de comportamento:** os 12 testes e2e passam sem alterar nenhuma asserção. Únicas
  edições permitidas nos e2e (wiring de DI): `app.get<ITokenService>(TOKEN_SERVICE)` em
  `users.e2e-spec.ts`; `.overrideProvider(GOOGLE_OAUTH_SERVICE)` em `auth.e2e-spec.ts` e
  `outbox-relay.e2e-spec.ts`; e atualização de caminhos de import.
- **`npx tsc --noEmit -p tsconfig.build.json` sai 0 ao final de toda task.** Manter `import type`
  para `Request`/`Response` do express em qualquer arquivo com decorators (TS1272 sob
  `isolatedModules`+`emitDecoratorMetadata`).
- **Working directory:** todos os comandos rodam a partir do checkout corrente — raiz =
  `git rev-parse --show-toplevel`, serviço em `<raiz>/Micro-services/auth`. **NUNCA usar caminho
  absoluto de outro checkout nem `cd` para fora do checkout corrente** (um plano anterior tinha
  `cd` hardcoded pro repo principal e causou commits na branch errada).
- Commits: mensagens exatamente como indicadas em cada task, rodadas da raiz do checkout.

---

### Task 1: Camada core (entities + exceptions + interfaces)

Puramente aditiva — nenhum arquivo existente muda.

**Files:**
- Create: `Micro-services/auth/src/core/entities/user.entity.ts`
- Create: `Micro-services/auth/src/core/entities/outbox-event.entity.ts`
- Create: `Micro-services/auth/src/core/exceptions/domain.exception.ts`
- Create: `Micro-services/auth/src/core/exceptions/invalid-refresh-token.exception.ts`
- Create: `Micro-services/auth/src/core/exceptions/google-authentication-failed.exception.ts`
- Create: `Micro-services/auth/src/core/exceptions/email-already-in-use.exception.ts`
- Create: `Micro-services/auth/src/core/exceptions/user-not-found.exception.ts`
- Create: `Micro-services/auth/src/core/interfaces/services/token-service.interface.ts`
- Create: `Micro-services/auth/src/core/interfaces/services/auth-service.interface.ts`
- Create: `Micro-services/auth/src/core/interfaces/services/user-service.interface.ts`
- Create: `Micro-services/auth/src/core/interfaces/repositories/user-repository.interface.ts`
- Create: `Micro-services/auth/src/core/interfaces/repositories/outbox-event-repository.interface.ts`
- Create: `Micro-services/auth/src/core/interfaces/external/google-oauth.interface.ts`
- Create: `Micro-services/auth/src/core/interfaces/external/event-publisher.interface.ts`

**Interfaces:**
- Produces (consumido por TODAS as tasks seguintes): entidades `User`/`UserRole`/`OutboxEvent`;
  exceções de domínio; interfaces `ITokenService`/`IAuthService`/`IUserService`/`IUserRepository`/
  `IOutboxEventRepository`/`IGoogleOAuthService`/`IEventPublisher` e os Symbols `TOKEN_SERVICE`,
  `AUTH_SERVICE`, `USER_SERVICE`, `USER_REPOSITORY`, `OUTBOX_EVENT_REPOSITORY`,
  `GOOGLE_OAUTH_SERVICE`, `EVENT_PUBLISHER`; tipos `AccessTokenPayload`, `TokenPair`, `LoginResult`,
  `GoogleProfile`, `CreateUserInput`, `CreateOutboxEventInput`.

- [ ] **Step 1: Criar as entities**

`src/core/entities/user.entity.ts`:

```typescript
export type UserRole = 'CUSTOMER' | 'SELLER' | 'ADMIN';

export interface UserProps {
  id: string;
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export class User {
  readonly id: string;
  readonly googleId: string;
  readonly email: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly role: UserRole;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: UserProps) {
    this.id = props.id;
    this.googleId = props.googleId;
    this.email = props.email;
    this.name = props.name;
    this.avatarUrl = props.avatarUrl;
    this.role = props.role;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
```

`src/core/entities/outbox-event.entity.ts`:

```typescript
export interface OutboxEventProps {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
}

export class OutboxEvent {
  readonly id: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly createdAt: Date;

  constructor(props: OutboxEventProps) {
    this.id = props.id;
    this.aggregateType = props.aggregateType;
    this.aggregateId = props.aggregateId;
    this.eventType = props.eventType;
    this.payload = props.payload;
    this.createdAt = props.createdAt;
  }
}
```

- [ ] **Step 2: Criar as exceções de domínio**

`src/core/exceptions/domain.exception.ts`:

```typescript
export abstract class DomainException extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
```

`src/core/exceptions/invalid-refresh-token.exception.ts`:

```typescript
import { DomainException } from './domain.exception';

export class InvalidRefreshTokenException extends DomainException {
  constructor() {
    super('Invalid or expired refresh token');
  }
}
```

`src/core/exceptions/google-authentication-failed.exception.ts`:

```typescript
import { DomainException } from './domain.exception';

export class GoogleAuthenticationFailedException extends DomainException {
  constructor() {
    super('Google authentication failed');
  }
}
```

`src/core/exceptions/email-already-in-use.exception.ts`:

```typescript
import { DomainException } from './domain.exception';

export class EmailAlreadyInUseException extends DomainException {
  constructor() {
    super('An account with this email already exists');
  }
}
```

`src/core/exceptions/user-not-found.exception.ts`:

```typescript
import { DomainException } from './domain.exception';

export class UserNotFoundException extends DomainException {
  constructor() {
    super('User not found');
  }
}
```

- [ ] **Step 3: Criar as interfaces de services**

`src/core/interfaces/services/token-service.interface.ts` (os tipos saem de
`core/auth/token.service.ts` — o arquivo original só é alterado na Task 3):

```typescript
export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface ITokenService {
  issueTokenPair(payload: AccessTokenPayload): Promise<TokenPair>;
  verifyAccessToken(token: string): Promise<AccessTokenPayload>;
  verifyRefreshToken(token: string): Promise<{ sub: string }>;
}
```

`src/core/interfaces/services/auth-service.interface.ts`:

```typescript
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
```

`src/core/interfaces/services/user-service.interface.ts`:

```typescript
import { User } from '../../entities/user.entity';

export const USER_SERVICE = Symbol('USER_SERVICE');

export interface IUserService {
  getProfile(userId: string): Promise<User>;
}
```

- [ ] **Step 4: Criar as interfaces de repositories**

`src/core/interfaces/repositories/user-repository.interface.ts`:

```typescript
import { User, UserRole } from '../../entities/user.entity';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface CreateUserInput {
  id: string;
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
}

export interface CreateOutboxEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface IUserRepository {
  findByGoogleId(googleId: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  updateProfile(id: string, data: { name: string; avatarUrl: string | null }): Promise<User>;
  /**
   * Persiste o usuário e o OutboxEvent na MESMA transação (Transactional Outbox).
   * Violação de unique (P2002, e-mail duplicado) vira EmailAlreadyInUseException.
   */
  createWithEvent(user: CreateUserInput, event: CreateOutboxEventInput): Promise<User>;
}
```

`src/core/interfaces/repositories/outbox-event-repository.interface.ts`:

```typescript
import { OutboxEvent } from '../../entities/outbox-event.entity';

export const OUTBOX_EVENT_REPOSITORY = Symbol('OUTBOX_EVENT_REPOSITORY');

export interface IOutboxEventRepository {
  /** Retorna até `limit` eventos PENDING, mais antigos primeiro. */
  findPending(limit: number): Promise<OutboxEvent[]>;
  /** Marca o evento como PUBLISHED com publishedAt = agora. */
  markPublished(id: string): Promise<void>;
}
```

- [ ] **Step 5: Criar as interfaces external**

`src/core/interfaces/external/google-oauth.interface.ts` (o tipo `GoogleProfile` sai de
`core/auth/google-oauth.service.ts` — arquivo original só muda na Task 3):

```typescript
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
```

`src/core/interfaces/external/event-publisher.interface.ts`:

```typescript
export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

export interface IEventPublisher {
  publish(topic: string, key: string, value: string): Promise<void>;
}
```

- [ ] **Step 6: Gate — compilação**

Run (de `Micro-services/auth`): `npx tsc --noEmit -p tsconfig.build.json`
Expected: exit 0.

Run: `npx jest`
Expected: 7 suites / 34 testes passando (nada existente foi tocado).

- [ ] **Step 7: Commit**

```bash
git add Micro-services/auth/src/core/entities Micro-services/auth/src/core/exceptions Micro-services/auth/src/core/interfaces
git commit -m "refactor(auth): add core layer (entities, domain exceptions, port interfaces)"
```

---

### Task 2: Adapters de saída (repositories + event publisher)

Aditiva — implementa as portas de core. Nada injeta essas classes ainda; os bindings por token são
registrados já nesta task (inofensivo) para as tasks 4 e 6 não precisarem mexer duas vezes.

**Files:**
- Create: `Micro-services/auth/src/adapters/out/repositories/user.repository.ts`
- Create: `Micro-services/auth/src/adapters/out/repositories/user.repository.spec.ts`
- Create: `Micro-services/auth/src/adapters/out/repositories/outbox-event.repository.ts`
- Create: `Micro-services/auth/src/adapters/out/repositories/outbox-event.repository.spec.ts`
- Create: `Micro-services/auth/src/adapters/out/external/kafka-event-publisher.ts`
- Create: `Micro-services/auth/src/adapters/out/external/kafka-event-publisher.spec.ts`
- Modify: `Micro-services/auth/src/auth.module.ts`

**Interfaces:**
- Consumes: portas e entities da Task 1; `PrismaService` e `KafkaProducerService` (pré-existentes,
  globais).
- Produces: `UserRepository`, `OutboxEventRepository`, `KafkaEventPublisher` bindados aos Symbols
  `USER_REPOSITORY`, `OUTBOX_EVENT_REPOSITORY`, `EVENT_PUBLISHER`.

- [ ] **Step 1: Escrever os testes (RED)**

`src/adapters/out/repositories/user.repository.spec.ts`:

```typescript
import { Prisma } from '@prisma/client';
import { UserRepository } from './user.repository';
import { User } from '../../../core/entities/user.entity';
import { EmailAlreadyInUseException } from '../../../core/exceptions/email-already-in-use.exception';

const row = {
  id: 'user-1',
  googleId: 'g-1',
  email: 'a@b.com',
  name: 'Ana',
  avatarUrl: null,
  role: 'CUSTOMER',
  createdAt: new Date('2026-07-10T10:00:00Z'),
  updatedAt: new Date('2026-07-10T10:00:00Z'),
};

function buildRepo() {
  const tx = { user: { create: jest.fn() }, outboxEvent: { create: jest.fn() } };
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(tx)),
  } as any;
  return { repo: new UserRepository(prisma), prisma, tx };
}

describe('UserRepository', () => {
  it('maps a found row to a User entity on findByGoogleId', async () => {
    const { repo, prisma } = buildRepo();
    prisma.user.findUnique.mockResolvedValue(row);

    const user = await repo.findByGoogleId('g-1');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { googleId: 'g-1' } });
    expect(user).toBeInstanceOf(User);
    expect(user!.email).toBe('a@b.com');
  });

  it('returns null when findById finds nothing', async () => {
    const { repo, prisma } = buildRepo();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(repo.findById('missing')).resolves.toBeNull();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'missing' } });
  });

  it('updates name/avatarUrl on updateProfile and maps the result', async () => {
    const { repo, prisma } = buildRepo();
    prisma.user.update.mockResolvedValue({ ...row, name: 'Novo Nome' });

    const user = await repo.updateProfile('user-1', { name: 'Novo Nome', avatarUrl: null });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Novo Nome', avatarUrl: null },
    });
    expect(user.name).toBe('Novo Nome');
  });

  it('creates user and outbox event inside the same transaction on createWithEvent', async () => {
    const { repo, prisma, tx } = buildRepo();
    tx.user.create.mockResolvedValue(row);
    tx.outboxEvent.create.mockResolvedValue({});

    const user = await repo.createWithEvent(
      { id: 'user-1', googleId: 'g-1', email: 'a@b.com', name: 'Ana', avatarUrl: null, role: 'CUSTOMER' },
      { aggregateType: 'User', aggregateId: 'user-1', eventType: 'UserRegistered', payload: { userId: 'user-1' } },
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledWith({
      data: { id: 'user-1', googleId: 'g-1', email: 'a@b.com', name: 'Ana', avatarUrl: null, role: 'CUSTOMER' },
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        aggregateType: 'User',
        aggregateId: 'user-1',
        eventType: 'UserRegistered',
        payload: { userId: 'user-1' },
      },
    });
    expect(user).toBeInstanceOf(User);
  });

  it('translates P2002 into EmailAlreadyInUseException', async () => {
    const { repo, tx } = buildRepo();
    tx.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`email`)', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }),
    );

    await expect(
      repo.createWithEvent(
        { id: 'u', googleId: 'g', email: 'dup@b.com', name: 'X', avatarUrl: null, role: 'CUSTOMER' },
        { aggregateType: 'User', aggregateId: 'u', eventType: 'UserRegistered', payload: {} },
      ),
    ).rejects.toThrow(EmailAlreadyInUseException);
  });
});
```

`src/adapters/out/repositories/outbox-event.repository.spec.ts`:

```typescript
import { OutboxEventRepository } from './outbox-event.repository';
import { OutboxEvent } from '../../../core/entities/outbox-event.entity';

function buildRepo() {
  const prisma = { outboxEvent: { findMany: jest.fn(), update: jest.fn() } } as any;
  return { repo: new OutboxEventRepository(prisma), prisma };
}

describe('OutboxEventRepository', () => {
  it('queries PENDING events oldest-first with the given limit and maps to entities', async () => {
    const { repo, prisma } = buildRepo();
    prisma.outboxEvent.findMany.mockResolvedValue([
      {
        id: 'evt-1',
        aggregateType: 'User',
        aggregateId: 'user-1',
        eventType: 'UserRegistered',
        payload: { userId: 'user-1' },
        status: 'PENDING',
        createdAt: new Date('2026-07-10T10:00:00Z'),
        updatedAt: new Date('2026-07-10T10:00:00Z'),
        publishedAt: null,
      },
    ]);

    const events = await repo.findPending(20);

    expect(prisma.outboxEvent.findMany).toHaveBeenCalledWith({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(OutboxEvent);
    expect(events[0].eventType).toBe('UserRegistered');
  });

  it('marks an event PUBLISHED with a publishedAt timestamp', async () => {
    const { repo, prisma } = buildRepo();
    prisma.outboxEvent.update.mockResolvedValue({});

    await repo.markPublished('evt-1');

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { status: 'PUBLISHED', publishedAt: expect.any(Date) },
    });
  });
});
```

`src/adapters/out/external/kafka-event-publisher.spec.ts`:

```typescript
import { KafkaEventPublisher } from './kafka-event-publisher';

describe('KafkaEventPublisher', () => {
  it('delegates to KafkaProducerService with a single keyed message', async () => {
    const producer = { publish: jest.fn().mockResolvedValue(undefined) } as any;
    const publisher = new KafkaEventPublisher(producer);

    await publisher.publish('auth-events', 'user-1', '{"eventType":"UserRegistered"}');

    expect(producer.publish).toHaveBeenCalledWith('auth-events', [
      { key: 'user-1', value: '{"eventType":"UserRegistered"}' },
    ]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar RED**

Run: `npx jest user.repository.spec.ts outbox-event.repository.spec.ts kafka-event-publisher.spec.ts`
Expected: FAIL — `Cannot find module './user.repository'` (e análogos).

- [ ] **Step 3: Implementar**

`src/adapters/out/repositories/user.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { Prisma, User as PrismaUser } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { User, UserRole } from '../../../core/entities/user.entity';
import { EmailAlreadyInUseException } from '../../../core/exceptions/email-already-in-use.exception';
import {
  CreateOutboxEventInput,
  CreateUserInput,
  IUserRepository,
} from '../../../core/interfaces/repositories/user-repository.interface';

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByGoogleId(googleId: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { googleId } });
    return row ? this.toEntity(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async updateProfile(id: string, data: { name: string; avatarUrl: string | null }): Promise<User> {
    const row = await this.prisma.user.update({ where: { id }, data });
    return this.toEntity(row);
  }

  async createWithEvent(user: CreateUserInput, event: CreateOutboxEventInput): Promise<User> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: user });
        await tx.outboxEvent.create({
          data: {
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            eventType: event.eventType,
            payload: event.payload as Prisma.InputJsonValue,
          },
        });
        return created;
      });
      return this.toEntity(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new EmailAlreadyInUseException();
      }
      throw error;
    }
  }

  private toEntity(row: PrismaUser): User {
    return new User({
      id: row.id,
      googleId: row.googleId,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatarUrl,
      role: row.role as UserRole,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
```

`src/adapters/out/repositories/outbox-event.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { OutboxEvent as PrismaOutboxEvent } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OutboxEvent } from '../../../core/entities/outbox-event.entity';
import { IOutboxEventRepository } from '../../../core/interfaces/repositories/outbox-event-repository.interface';

@Injectable()
export class OutboxEventRepository implements IOutboxEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPending(limit: number): Promise<OutboxEvent[]> {
    const rows = await this.prisma.outboxEvent.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return rows.map((row) => this.toEntity(row));
  }

  async markPublished(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  }

  private toEntity(row: PrismaOutboxEvent): OutboxEvent {
    return new OutboxEvent({
      id: row.id,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      eventType: row.eventType,
      payload: row.payload,
      createdAt: row.createdAt,
    });
  }
}
```

`src/adapters/out/external/kafka-event-publisher.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { KafkaProducerService } from '../messaging/kafka-producer.service';
import { IEventPublisher } from '../../../core/interfaces/external/event-publisher.interface';

@Injectable()
export class KafkaEventPublisher implements IEventPublisher {
  constructor(private readonly producer: KafkaProducerService) {}

  async publish(topic: string, key: string, value: string): Promise<void> {
    await this.producer.publish(topic, [{ key, value }]);
  }
}
```

- [ ] **Step 4: Registrar os bindings no module**

Em `src/auth.module.ts`, adicionar os imports:

```typescript
import { USER_REPOSITORY } from './core/interfaces/repositories/user-repository.interface';
import { OUTBOX_EVENT_REPOSITORY } from './core/interfaces/repositories/outbox-event-repository.interface';
import { EVENT_PUBLISHER } from './core/interfaces/external/event-publisher.interface';
import { UserRepository } from './adapters/out/repositories/user.repository';
import { OutboxEventRepository } from './adapters/out/repositories/outbox-event.repository';
import { KafkaEventPublisher } from './adapters/out/external/kafka-event-publisher';
```

e no array `providers`, adicionar (mantendo todos os providers atuais):

```typescript
    { provide: USER_REPOSITORY, useClass: UserRepository },
    { provide: OUTBOX_EVENT_REPOSITORY, useClass: OutboxEventRepository },
    { provide: EVENT_PUBLISHER, useClass: KafkaEventPublisher },
```

- [ ] **Step 5: Gate**

Run: `npx jest` → todas as suítes verdes (34 existentes + 8 novos).
Run: `npx tsc --noEmit -p tsconfig.build.json` → exit 0.
Run: `npx jest --config ./test/jest-e2e.json` → 12/12 (containers `auth-db`+`kafka` de pé).

- [ ] **Step 6: Commit**

```bash
git add Micro-services/auth/src/adapters/out/repositories Micro-services/auth/src/adapters/out/external Micro-services/auth/src/auth.module.ts
git commit -m "refactor(auth): add out adapters (prisma repositories, kafka event publisher)"
```

---

### Task 3: Realocar TokenService → application e GoogleOAuthService → adapters/out/external

Movimentação com rewire mínimo: classes passam a implementar as portas; os tipos duplicados saem
dos arquivos de service (ficam só em core). Consumidores atualizam import — sem mudança de lógica.

**Files:**
- Move: `src/core/auth/token.service.ts` → `src/application/services/token.service.ts` (+spec)
- Move: `src/core/auth/google-oauth.service.ts` → `src/adapters/out/external/google-oauth.service.ts` (+spec)
- Modify: `src/core/auth/auth.service.ts` (só imports)
- Modify: `src/adapters/in/http/jwt-auth.guard.ts` (só imports)
- Modify: `src/adapters/in/http/express.d.ts` (só import)
- Modify: `src/auth.module.ts` (só caminhos de import)
- Modify: `test/users.e2e-spec.ts` (só caminho de import)

**Interfaces:**
- Consumes: `ITokenService`/`IGoogleOAuthService` + tipos da Task 1.
- Produces: `TokenService` em `application/services` implementando `ITokenService`;
  `GoogleOAuthService` em `adapters/out/external` implementando `IGoogleOAuthService`.
  Bindings por token destes dois ficam pra Task 6 — nesta task os providers continuam por classe.

- [ ] **Step 1: Mover TokenService**

```bash
cd Micro-services/auth
mkdir -p src/application/services
git mv src/core/auth/token.service.ts src/application/services/token.service.ts
git mv src/core/auth/token.service.spec.ts src/application/services/token.service.spec.ts
```

Editar `src/application/services/token.service.ts` — o cabeçalho vira:

```typescript
import { Injectable } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import {
  AccessTokenPayload,
  ITokenService,
  TokenPair,
} from '../../core/interfaces/services/token-service.interface';

@Injectable()
export class TokenService implements ITokenService {
```

e **remover** as declarações locais `export interface AccessTokenPayload {...}` e
`export interface TokenPair {...}` (agora vêm de core). O corpo dos 3 métodos fica idêntico.

Em `src/application/services/token.service.spec.ts` nada muda além do import relativo
(`./token.service` continua válido — arquivo e spec moveram juntos).

- [ ] **Step 2: Mover GoogleOAuthService**

```bash
git mv src/core/auth/google-oauth.service.ts src/adapters/out/external/google-oauth.service.ts
git mv src/core/auth/google-oauth.service.spec.ts src/adapters/out/external/google-oauth.service.spec.ts
```

Editar `src/adapters/out/external/google-oauth.service.ts` — cabeçalho vira:

```typescript
import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import {
  GoogleProfile,
  IGoogleOAuthService,
} from '../../../core/interfaces/external/google-oauth.interface';

@Injectable()
export class GoogleOAuthService implements IGoogleOAuthService {
```

e **remover** a declaração local `export interface GoogleProfile {...}`. Corpo idêntico.

No spec movido, o import `./google-oauth.service` continua válido.

- [ ] **Step 3: Atualizar os consumidores (só linhas de import)**

`src/core/auth/auth.service.ts` (ainda no lugar antigo até a Task 6):

```typescript
import { GoogleOAuthService } from '../../adapters/out/external/google-oauth.service';
import { GoogleProfile } from '../interfaces/external/google-oauth.interface';
import { TokenService } from '../../application/services/token.service';
import { TokenPair } from '../interfaces/services/token-service.interface';
```

(substituindo os imports antigos de `./google-oauth.service` e `./token.service`; o resto do
arquivo intacto.)

`src/adapters/in/http/jwt-auth.guard.ts`:

```typescript
import { TokenService } from '../../../application/services/token.service';
```

`src/adapters/in/http/express.d.ts`:

```typescript
import { AccessTokenPayload } from '../../../core/interfaces/services/token-service.interface';
```

`src/auth.module.ts` — atualizar os dois caminhos:

```typescript
import { TokenService } from './application/services/token.service';
import { GoogleOAuthService } from './adapters/out/external/google-oauth.service';
```

`test/users.e2e-spec.ts`:

```typescript
import { TokenService } from '../src/application/services/token.service';
```

`test/auth.e2e-spec.ts` e `test/outbox-relay.e2e-spec.ts`:

```typescript
import { GoogleOAuthService } from '../src/adapters/out/external/google-oauth.service';
```

- [ ] **Step 4: Gate completo**

Run: `npx jest` → verdes; `npx tsc --noEmit -p tsconfig.build.json` → 0;
`npx jest --config ./test/jest-e2e.json` → 12/12.

- [ ] **Step 5: Commit**

```bash
git add -A Micro-services/auth/src Micro-services/auth/test
git commit -m "refactor(auth): relocate TokenService to application and GoogleOAuthService to out/external"
```

---

### Task 4: OutboxRelayService → application, via portas

**Files:**
- Move: `src/core/auth/outbox-relay.service.ts` → `src/application/services/outbox-relay.service.ts` (+spec)
- Modify: `src/auth.module.ts` (caminho de import)

**Interfaces:**
- Consumes: `IOutboxEventRepository`/`IEventPublisher` (+Symbols, bindados na Task 2), entity
  `OutboxEvent`.
- Produces: `OutboxRelayService` em application, sem nenhum import de adapters.

- [ ] **Step 1: Mover e reescrever o service**

```bash
git mv src/core/auth/outbox-relay.service.ts src/application/services/outbox-relay.service.ts
git mv src/core/auth/outbox-relay.service.spec.ts src/application/services/outbox-relay.service.spec.ts
```

Conteúdo novo de `src/application/services/outbox-relay.service.ts` (mesma lógica — envelope,
`eventId` estável, guard de reentrância, erro deixa PENDING — trocando Prisma/Kafka pelas portas):

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OutboxEvent } from '../../core/entities/outbox-event.entity';
import {
  IOutboxEventRepository,
  OUTBOX_EVENT_REPOSITORY,
} from '../../core/interfaces/repositories/outbox-event-repository.interface';
import {
  EVENT_PUBLISHER,
  IEventPublisher,
} from '../../core/interfaces/external/event-publisher.interface';

const AUTH_EVENTS_TOPIC = 'auth-events';
const POLL_BATCH_SIZE = 20;

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  private isRelaying = false;

  constructor(
    @Inject(OUTBOX_EVENT_REPOSITORY) private readonly outboxRepository: IOutboxEventRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  @Interval(5000)
  async relayPendingEvents(): Promise<void> {
    if (this.isRelaying) {
      return;
    }

    this.isRelaying = true;
    try {
      const pending = await this.outboxRepository.findPending(POLL_BATCH_SIZE);
      for (const event of pending) {
        await this.relayOne(event);
      }
    } finally {
      this.isRelaying = false;
    }
  }

  private async relayOne(event: OutboxEvent): Promise<void> {
    const envelope = {
      eventId: event.id,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      occurredAt: event.createdAt.toISOString(),
      version: 1,
      payload: event.payload,
    };

    try {
      await this.eventPublisher.publish(AUTH_EVENTS_TOPIC, event.aggregateId, JSON.stringify(envelope));
      await this.outboxRepository.markPublished(event.id);
    } catch (error) {
      this.logger.error(`Failed to relay outbox event ${event.id}`, error as Error);
    }
  }
}
```

- [ ] **Step 2: Reescrever o spec pra mockar as portas**

Conteúdo novo de `src/application/services/outbox-relay.service.spec.ts` (mesmos 5 casos de teste,
mocks trocados de Prisma/producer para as portas):

```typescript
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxEvent } from '../../core/entities/outbox-event.entity';

function buildService() {
  const outboxRepository = { findPending: jest.fn(), markPublished: jest.fn() } as any;
  const eventPublisher = { publish: jest.fn() } as any;
  const service = new OutboxRelayService(outboxRepository, eventPublisher);
  return { service, outboxRepository, eventPublisher };
}

function makeEvent(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return new OutboxEvent({
    id: 'evt-1',
    aggregateType: 'User',
    aggregateId: 'user-1',
    eventType: 'UserRegistered',
    payload: { userId: 'user-1' },
    createdAt: new Date('2026-07-09T10:00:00.000Z'),
    ...overrides,
  });
}

describe('OutboxRelayService', () => {
  it('publishes each pending event keyed by aggregateId and marks it published', async () => {
    const { service, outboxRepository, eventPublisher } = buildService();
    outboxRepository.findPending.mockResolvedValue([makeEvent()]);
    eventPublisher.publish.mockResolvedValue(undefined);

    await service.relayPendingEvents();

    expect(outboxRepository.findPending).toHaveBeenCalledWith(20);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'auth-events',
      'user-1',
      expect.stringContaining('"eventType":"UserRegistered"'),
    );
    expect(outboxRepository.markPublished).toHaveBeenCalledWith('evt-1');
  });

  it('leaves the event pending and does not throw when the publish fails', async () => {
    const { service, outboxRepository, eventPublisher } = buildService();
    outboxRepository.findPending.mockResolvedValue([makeEvent()]);
    eventPublisher.publish.mockRejectedValue(new Error('broker unreachable'));

    await expect(service.relayPendingEvents()).resolves.toBeUndefined();
    expect(outboxRepository.markPublished).not.toHaveBeenCalled();
  });

  it('does nothing when there are no pending events', async () => {
    const { service, outboxRepository, eventPublisher } = buildService();
    outboxRepository.findPending.mockResolvedValue([]);

    await service.relayPendingEvents();

    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it("uses the outbox event's own id as the envelope eventId, not a freshly generated one", async () => {
    const { service, outboxRepository, eventPublisher } = buildService();
    outboxRepository.findPending.mockResolvedValue([makeEvent({ id: 'evt-stable-id' })]);
    eventPublisher.publish.mockResolvedValue(undefined);

    await service.relayPendingEvents();

    const [, , value] = eventPublisher.publish.mock.calls[0];
    const envelope = JSON.parse(value);
    expect(envelope.eventId).toBe('evt-stable-id');
  });

  it('does not start a second poll while a previous one is still in flight', async () => {
    const { service, outboxRepository, eventPublisher } = buildService();
    let resolvePublish: () => void = () => {};
    const publishPromise = new Promise<void>((resolve) => {
      resolvePublish = resolve;
    });
    outboxRepository.findPending.mockResolvedValue([makeEvent()]);
    eventPublisher.publish.mockReturnValue(publishPromise);

    const firstCall = service.relayPendingEvents();
    const secondCall = service.relayPendingEvents();

    resolvePublish();
    await Promise.all([firstCall, secondCall]);

    expect(outboxRepository.findPending).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Atualizar caminho no module**

`src/auth.module.ts`:

```typescript
import { OutboxRelayService } from './application/services/outbox-relay.service';
```

(`OutboxRelayService` continua listado como provider por classe — ninguém o injeta.)

- [ ] **Step 4: Gate completo**

Run: `npx jest` → verdes; `npx tsc --noEmit -p tsconfig.build.json` → 0;
`npx jest --config ./test/jest-e2e.json` → 12/12 (o e2e do relay valida o fluxo real
DB→relay→Kafka de ponta a ponta com a nova composição).

- [ ] **Step 5: Commit**

```bash
git add -A Micro-services/auth/src
git commit -m "refactor(auth): move OutboxRelayService to application, wired via ports"
```

---

### Task 5: Filter global + mapper + DTOs de resposta (inertes)

Aditiva: o filter entra registrado mas nada lança `DomainException` ainda; mapper/DTOs entram sem
consumidores. Comportamento inalterado.

**Files:**
- Create: `src/adapters/in/filters/domain-exception.filter.ts` (+spec)
- Create: `src/adapters/in/dtos/user-response.dto.ts`
- Create: `src/adapters/in/dtos/login-response.dto.ts`
- Create: `src/application/mappers/user.mapper.ts` (+spec)
- Modify: `src/auth.module.ts` (APP_FILTER)

**Interfaces:**
- Consumes: exceções de domínio (Task 1), entity `User`.
- Produces: `DomainExceptionFilter` ativo globalmente; `UserMapper.toResponse(user): UserResponseDto`;
  `LoginResponseDto`/`UserResponseDto` para a Task 6.

- [ ] **Step 1: Testes (RED)**

`src/adapters/in/filters/domain-exception.filter.spec.ts`:

```typescript
import { ArgumentsHost } from '@nestjs/common';
import { DomainExceptionFilter } from './domain-exception.filter';
import { InvalidRefreshTokenException } from '../../../core/exceptions/invalid-refresh-token.exception';
import { GoogleAuthenticationFailedException } from '../../../core/exceptions/google-authentication-failed.exception';
import { EmailAlreadyInUseException } from '../../../core/exceptions/email-already-in-use.exception';
import { UserNotFoundException } from '../../../core/exceptions/user-not-found.exception';
import { DomainException } from '../../../core/exceptions/domain.exception';

class UnmappedException extends DomainException {
  constructor() {
    super('unmapped');
  }
}

function mockHost() {
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();

  it.each([
    [new InvalidRefreshTokenException(), 401, 'Unauthorized'],
    [new GoogleAuthenticationFailedException(), 400, 'Bad Request'],
    [new EmailAlreadyInUseException(), 409, 'Conflict'],
    [new UserNotFoundException(), 404, 'Not Found'],
  ])('maps %p to HTTP %i', (exception, status, error) => {
    const { host, response } = mockHost();

    filter.catch(exception as DomainException, host);

    expect(response.status).toHaveBeenCalledWith(status);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: status,
      message: (exception as DomainException).message,
      error,
    });
  });

  it('falls back to 500 for an unmapped domain exception', () => {
    const { host, response } = mockHost();

    filter.catch(new UnmappedException(), host);

    expect(response.status).toHaveBeenCalledWith(500);
  });
});
```

`src/application/mappers/user.mapper.spec.ts`:

```typescript
import { UserMapper } from './user.mapper';
import { User } from '../../core/entities/user.entity';

describe('UserMapper', () => {
  it('maps a User entity to the public response shape, dropping internal fields', () => {
    const user = new User({
      id: 'user-1',
      googleId: 'g-1',
      email: 'a@b.com',
      name: 'Ana',
      avatarUrl: null,
      role: 'CUSTOMER',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const dto = UserMapper.toResponse(user);

    expect(dto).toEqual({
      id: 'user-1',
      email: 'a@b.com',
      name: 'Ana',
      avatarUrl: null,
      role: 'CUSTOMER',
    });
    expect(dto).not.toHaveProperty('googleId');
  });
});
```

Run: `npx jest domain-exception.filter.spec.ts user.mapper.spec.ts` → FAIL (módulos não existem).

- [ ] **Step 2: Implementar**

`src/adapters/in/dtos/user-response.dto.ts`:

```typescript
export class UserResponseDto {
  id!: string;
  email!: string;
  name!: string;
  avatarUrl!: string | null;
  role!: string;
}
```

`src/adapters/in/dtos/login-response.dto.ts`:

```typescript
import { UserResponseDto } from './user-response.dto';

export class LoginResponseDto {
  accessToken!: string;
  refreshToken!: string;
  user!: UserResponseDto;
}
```

`src/application/mappers/user.mapper.ts`:

```typescript
import { User } from '../../core/entities/user.entity';
import { UserResponseDto } from '../../adapters/in/dtos/user-response.dto';

export class UserMapper {
  static toResponse(user: User): UserResponseDto {
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

`src/adapters/in/filters/domain-exception.filter.ts`:

```typescript
import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainException } from '../../../core/exceptions/domain.exception';
import { InvalidRefreshTokenException } from '../../../core/exceptions/invalid-refresh-token.exception';
import { GoogleAuthenticationFailedException } from '../../../core/exceptions/google-authentication-failed.exception';
import { EmailAlreadyInUseException } from '../../../core/exceptions/email-already-in-use.exception';
import { UserNotFoundException } from '../../../core/exceptions/user-not-found.exception';

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const httpException = this.toHttp(exception);
    response.status(httpException.getStatus()).json(httpException.getResponse());
  }

  private toHttp(exception: DomainException): HttpException {
    if (exception instanceof InvalidRefreshTokenException) {
      return new UnauthorizedException(exception.message);
    }
    if (exception instanceof GoogleAuthenticationFailedException) {
      return new BadRequestException(exception.message);
    }
    if (exception instanceof EmailAlreadyInUseException) {
      return new ConflictException(exception.message);
    }
    if (exception instanceof UserNotFoundException) {
      return new NotFoundException(exception.message);
    }
    return new InternalServerErrorException();
  }
}
```

- [ ] **Step 3: Registrar via APP_FILTER**

`src/auth.module.ts` — imports:

```typescript
import { APP_FILTER } from '@nestjs/core';
import { DomainExceptionFilter } from './adapters/in/filters/domain-exception.filter';
```

providers (adicionar):

```typescript
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
```

- [ ] **Step 4: Gate**

Run: `npx jest` → verdes (novos + antigos); `npx tsc --noEmit -p tsconfig.build.json` → 0;
`npx jest --config ./test/jest-e2e.json` → 12/12.

- [ ] **Step 5: Commit**

```bash
git add Micro-services/auth/src/adapters/in/filters Micro-services/auth/src/adapters/in/dtos Micro-services/auth/src/application/mappers Micro-services/auth/src/auth.module.ts
git commit -m "refactor(auth): add global domain exception filter, user mapper and response dtos"
```

---

### Task 6: Cutover — AuthService/UserService com portas + exceções de domínio + controllers via tokens

O coração da refatoração. Tudo nesta task é interdependente e precisa entrar junto.

**Files:**
- Move: `src/core/auth/auth.service.ts` → `src/application/services/auth.service.ts` (+spec, reescritos)
- Create: `src/application/services/user.service.ts` (+spec)
- Modify: `src/adapters/in/http/auth.controller.ts` (+spec)
- Modify: `src/adapters/in/http/users.controller.ts` (+spec)
- Modify: `src/adapters/in/http/jwt-auth.guard.ts` (+spec: injeção por token)
- Modify: `src/auth.module.ts` (forma final)
- Modify: `test/users.e2e-spec.ts`, `test/auth.e2e-spec.ts`, `test/outbox-relay.e2e-spec.ts` (wiring)
- Delete: pasta `src/core/auth/` (fica vazia após o move)

**Interfaces:**
- Consumes: tudo das Tasks 1, 2, 3, 5.
- Produces: árvore final de DI por tokens; nenhuma exceção HTTP em application; `core/auth` extinto.

- [ ] **Step 1: Mover e reescrever AuthService**

```bash
git mv src/core/auth/auth.service.ts src/application/services/auth.service.ts
git mv src/core/auth/auth.service.spec.ts src/application/services/auth.service.spec.ts
```

Conteúdo novo de `src/application/services/auth.service.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { User, UserRole } from '../../core/entities/user.entity';
import { GoogleAuthenticationFailedException } from '../../core/exceptions/google-authentication-failed.exception';
import { InvalidRefreshTokenException } from '../../core/exceptions/invalid-refresh-token.exception';
import { IAuthService, LoginResult } from '../../core/interfaces/services/auth-service.interface';
import {
  ITokenService,
  TOKEN_SERVICE,
} from '../../core/interfaces/services/token-service.interface';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../core/interfaces/repositories/user-repository.interface';
import {
  GOOGLE_OAUTH_SERVICE,
  GoogleProfile,
  IGoogleOAuthService,
} from '../../core/interfaces/external/google-oauth.interface';

@Injectable()
export class AuthService implements IAuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(GOOGLE_OAUTH_SERVICE) private readonly googleOAuth: IGoogleOAuthService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: ITokenService,
  ) {}

  buildGoogleAuthUrl(state: string): string {
    return this.googleOAuth.buildAuthUrl(state);
  }

  async loginWithGoogleCode(code: string): Promise<LoginResult> {
    let profile: GoogleProfile;
    try {
      profile = await this.googleOAuth.exchangeCodeForProfile(code);
    } catch {
      throw new GoogleAuthenticationFailedException();
    }

    const user = await this.upsertUser(profile);
    const tokens = await this.tokenService.issueTokenPair({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return { ...tokens, user };
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
    let sub: string;
    try {
      ({ sub } = await this.tokenService.verifyRefreshToken(refreshToken));
    } catch {
      throw new InvalidRefreshTokenException();
    }

    const user = await this.userRepository.findById(sub);
    if (!user) {
      // usuário deletado: mesmo 401 de token inválido (não vazar existência)
      throw new InvalidRefreshTokenException();
    }

    const { accessToken } = await this.tokenService.issueTokenPair({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return { accessToken };
  }

  private async upsertUser(profile: GoogleProfile): Promise<User> {
    const existing = await this.userRepository.findByGoogleId(profile.googleId);
    if (existing) {
      return this.userRepository.updateProfile(existing.id, {
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      });
    }

    // Regra de negócio explícita no service: id gerado aqui (permite montar o evento
    // antes da persistência) e novo usuário nasce CUSTOMER.
    const id = randomUUID();
    const role: UserRole = 'CUSTOMER';

    return this.userRepository.createWithEvent(
      {
        id,
        googleId: profile.googleId,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        role,
      },
      {
        aggregateType: 'User',
        aggregateId: id,
        eventType: 'UserRegistered',
        payload: { userId: id, email: profile.email, name: profile.name, role },
      },
    );
  }
}
```

Conteúdo novo de `src/application/services/auth.service.spec.ts` (mocka as 3 portas; a tradução de
P2002→Conflict agora é testada no `user.repository.spec.ts`, não aqui):

```typescript
import { AuthService } from './auth.service';
import { User } from '../../core/entities/user.entity';
import { GoogleAuthenticationFailedException } from '../../core/exceptions/google-authentication-failed.exception';
import { InvalidRefreshTokenException } from '../../core/exceptions/invalid-refresh-token.exception';

function makeUser(overrides: Partial<User> = {}): User {
  return new User({
    id: 'user-1',
    googleId: 'g-1',
    email: 'a@b.com',
    name: 'Ana',
    avatarUrl: null,
    role: 'CUSTOMER',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function buildService() {
  const userRepository = {
    findByGoogleId: jest.fn(),
    findById: jest.fn(),
    updateProfile: jest.fn(),
    createWithEvent: jest.fn(),
  } as any;
  const googleOAuth = { buildAuthUrl: jest.fn(), exchangeCodeForProfile: jest.fn() } as any;
  const tokenService = { issueTokenPair: jest.fn(), verifyRefreshToken: jest.fn() } as any;
  const service = new AuthService(userRepository, googleOAuth, tokenService);
  return { service, userRepository, googleOAuth, tokenService };
}

describe('AuthService', () => {
  it('creates a new user with a service-generated id and a matching UserRegistered event', async () => {
    const { service, userRepository, googleOAuth, tokenService } = buildService();
    googleOAuth.exchangeCodeForProfile.mockResolvedValue({
      googleId: 'g-1',
      email: 'a@b.com',
      name: 'Ana',
      avatarUrl: null,
    });
    userRepository.findByGoogleId.mockResolvedValue(null);
    userRepository.createWithEvent.mockImplementation(async (input: any) => makeUser({ id: input.id }));
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });

    const result = await service.loginWithGoogleCode('code-1');

    const [userInput, eventInput] = userRepository.createWithEvent.mock.calls[0];
    expect(userInput.role).toBe('CUSTOMER');
    expect(eventInput.eventType).toBe('UserRegistered');
    // id gerado no service amarra usuário e evento
    expect(eventInput.aggregateId).toBe(userInput.id);
    expect(eventInput.payload).toEqual({
      userId: userInput.id,
      email: 'a@b.com',
      name: 'Ana',
      role: 'CUSTOMER',
    });
    expect(result.accessToken).toBe('at');
    expect(result.user.id).toBe(userInput.id);
  });

  it('updates an existing user without creating an event', async () => {
    const { service, userRepository, googleOAuth, tokenService } = buildService();
    googleOAuth.exchangeCodeForProfile.mockResolvedValue({
      googleId: 'g-1',
      email: 'a@b.com',
      name: 'Novo Nome',
      avatarUrl: 'pic',
    });
    userRepository.findByGoogleId.mockResolvedValue(makeUser());
    userRepository.updateProfile.mockResolvedValue(makeUser({ name: 'Novo Nome' }));
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });

    const result = await service.loginWithGoogleCode('code-1');

    expect(userRepository.updateProfile).toHaveBeenCalledWith('user-1', {
      name: 'Novo Nome',
      avatarUrl: 'pic',
    });
    expect(userRepository.createWithEvent).not.toHaveBeenCalled();
    expect(result.user.name).toBe('Novo Nome');
  });

  it('throws GoogleAuthenticationFailedException when the code exchange fails', async () => {
    const { service, googleOAuth } = buildService();
    googleOAuth.exchangeCodeForProfile.mockRejectedValue(new Error('invalid_grant'));

    await expect(service.loginWithGoogleCode('bad-code')).rejects.toThrow(
      GoogleAuthenticationFailedException,
    );
  });

  it('issues a new access token for a valid refresh token', async () => {
    const { service, userRepository, tokenService } = buildService();
    tokenService.verifyRefreshToken.mockResolvedValue({ sub: 'user-1' });
    userRepository.findById.mockResolvedValue(makeUser());
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'new-at', refreshToken: 'new-rt' });

    await expect(service.refreshAccessToken('valid')).resolves.toEqual({ accessToken: 'new-at' });
  });

  it('throws InvalidRefreshTokenException when verification fails', async () => {
    const { service, tokenService } = buildService();
    tokenService.verifyRefreshToken.mockRejectedValue(new Error('jwt expired'));

    await expect(service.refreshAccessToken('expired')).rejects.toThrow(InvalidRefreshTokenException);
  });

  it('throws InvalidRefreshTokenException when the user no longer exists', async () => {
    const { service, userRepository, tokenService } = buildService();
    tokenService.verifyRefreshToken.mockResolvedValue({ sub: 'deleted' });
    userRepository.findById.mockResolvedValue(null);

    await expect(service.refreshAccessToken('orphan')).rejects.toThrow(InvalidRefreshTokenException);
  });
});
```

Remover a pasta vazia: `rmdir src/core/auth` (git não versiona pastas vazias — só conferir que
não sobrou arquivo).

- [ ] **Step 2: Criar UserService**

`src/application/services/user.service.spec.ts`:

```typescript
import { UserService } from './user.service';
import { User } from '../../core/entities/user.entity';
import { UserNotFoundException } from '../../core/exceptions/user-not-found.exception';

describe('UserService', () => {
  it('returns the user profile', async () => {
    const userRepository = {
      findById: jest.fn().mockResolvedValue(
        new User({
          id: 'user-1',
          googleId: 'g-1',
          email: 'a@b.com',
          name: 'Ana',
          avatarUrl: null,
          role: 'CUSTOMER',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
    } as any;
    const service = new UserService(userRepository);

    const user = await service.getProfile('user-1');

    expect(userRepository.findById).toHaveBeenCalledWith('user-1');
    expect(user.email).toBe('a@b.com');
  });

  it('throws UserNotFoundException when the user does not exist', async () => {
    const userRepository = { findById: jest.fn().mockResolvedValue(null) } as any;
    const service = new UserService(userRepository);

    await expect(service.getProfile('missing')).rejects.toThrow(UserNotFoundException);
  });
});
```

`src/application/services/user.service.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { User } from '../../core/entities/user.entity';
import { UserNotFoundException } from '../../core/exceptions/user-not-found.exception';
import { IUserService } from '../../core/interfaces/services/user-service.interface';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../core/interfaces/repositories/user-repository.interface';

@Injectable()
export class UserService implements IUserService {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository) {}

  async getProfile(userId: string): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UserNotFoundException();
    }
    return user;
  }
}
```

- [ ] **Step 3: Controllers e guard via tokens (ainda no caminho antigo `in/http` — movem na Task 7)**

`src/adapters/in/http/auth.controller.ts` — conteúdo novo:

```typescript
import { BadRequestException, Body, Controller, Get, Inject, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AUTH_SERVICE, IAuthService } from '../../../core/interfaces/services/auth-service.interface';
import { UserMapper } from '../../../application/mappers/user.mapper';
import { LoginResponseDto } from '../dtos/login-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_COOKIE_MAX_AGE_MS = 5 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(@Inject(AUTH_SERVICE) private readonly authService: IAuthService) {}

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
  ): Promise<LoginResponseDto> {
    const cookieState: string | undefined = req.cookies?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE);

    if (!state || !cookieState || state !== cookieState) {
      throw new BadRequestException('Invalid or missing OAuth state');
    }

    const result = await this.authService.loginWithGoogleCode(code);
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: UserMapper.toResponse(result.user),
    };
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

Nota: o import do DTO de resposta usa `../dtos/` (caminho final, Task 5) enquanto o
`RefreshTokenDto` continua em `./dto/` (move na Task 7). O `BadRequestException` do state/refresh
continua sendo lançado direto no controller: validação de formato de request é responsabilidade da
borda HTTP, não regra de domínio.

`src/adapters/in/http/auth.controller.spec.ts` — mudanças: o mock de service é o mesmo objeto (a
construção manual `new AuthController(authService)` não passa pelo DI, então nada muda na
construção), mas o teste do callback com state válido agora espera o shape mapeado. Substituir o
teste `'logs the user in when the callback state matches the cookie'` por:

```typescript
  it('logs the user in when the callback state matches the cookie', async () => {
    const { controller, authService } = buildController();
    authService.loginWithGoogleCode.mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      user: {
        id: 'user-1',
        googleId: 'g-1',
        email: 'a@b.com',
        name: 'Ana',
        avatarUrl: null,
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const req = { cookies: { oauth_state: 'state-123' } } as any;
    const res = { clearCookie: jest.fn() } as any;

    const result = await controller.googleCallback('auth-code', 'state-123', req, res);

    expect(authService.loginWithGoogleCode).toHaveBeenCalledWith('auth-code');
    expect(res.clearCookie).toHaveBeenCalledWith('oauth_state');
    expect(result).toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      user: { id: 'user-1', email: 'a@b.com', name: 'Ana', avatarUrl: null, role: 'CUSTOMER' },
    });
  });
```

(Os demais testes do arquivo ficam como estão.)

`src/adapters/in/http/users.controller.ts` — conteúdo novo (sai o Prisma):

```typescript
import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IUserService, USER_SERVICE } from '../../../core/interfaces/services/user-service.interface';
import { UserMapper } from '../../../application/mappers/user.mapper';
import { UserResponseDto } from '../dtos/user-response.dto';
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
```

`src/adapters/in/http/users.controller.spec.ts` — conteúdo novo:

```typescript
import { UsersController } from './users.controller';
import { User } from '../../../core/entities/user.entity';
import { UserNotFoundException } from '../../../core/exceptions/user-not-found.exception';

describe('UsersController', () => {
  it('returns the authenticated user profile as a response dto', async () => {
    const userService = {
      getProfile: jest.fn().mockResolvedValue(
        new User({
          id: 'user-1',
          googleId: 'g-1',
          email: 'a@b.com',
          name: 'Ana',
          avatarUrl: null,
          role: 'CUSTOMER',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
    } as any;
    const controller = new UsersController(userService);
    const request = { user: { sub: 'user-1', email: 'a@b.com', role: 'CUSTOMER' } } as any;

    const result = await controller.me(request);

    expect(userService.getProfile).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({
      id: 'user-1',
      email: 'a@b.com',
      name: 'Ana',
      avatarUrl: null,
      role: 'CUSTOMER',
    });
  });

  it('propagates UserNotFoundException (translated to 404 by the global filter)', async () => {
    const userService = {
      getProfile: jest.fn().mockRejectedValue(new UserNotFoundException()),
    } as any;
    const controller = new UsersController(userService);
    const request = { user: { sub: 'missing', email: 'x@y.com', role: 'CUSTOMER' } } as any;

    await expect(controller.me(request)).rejects.toThrow(UserNotFoundException);
  });
});
```

`src/adapters/in/http/jwt-auth.guard.ts` — injeção por token; cabeçalho e construtor viram:

```typescript
import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import {
  ITokenService,
  TOKEN_SERVICE,
} from '../../../core/interfaces/services/token-service.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(TOKEN_SERVICE) private readonly tokenService: ITokenService) {}
```

(resto do arquivo idêntico — `canActivate` e `extractToken` não mudam.)

No spec do guard, só o import muda:

```typescript
import { ITokenService } from '../../../core/interfaces/services/token-service.interface';
```

e **todas** as ocorrências de `as unknown as TokenService` (uma por teste, 4 no total) viram
`as unknown as ITokenService`.

- [ ] **Step 4: Forma final do auth.module**

`src/auth.module.ts` — conteúdo completo:

```typescript
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthController } from './adapters/in/http/auth.controller';
import { UsersController } from './adapters/in/http/users.controller';
import { JwtAuthGuard } from './adapters/in/http/jwt-auth.guard';
import { DomainExceptionFilter } from './adapters/in/filters/domain-exception.filter';
import { AuthService } from './application/services/auth.service';
import { UserService } from './application/services/user.service';
import { TokenService } from './application/services/token.service';
import { OutboxRelayService } from './application/services/outbox-relay.service';
import { GoogleOAuthService } from './adapters/out/external/google-oauth.service';
import { KafkaEventPublisher } from './adapters/out/external/kafka-event-publisher';
import { UserRepository } from './adapters/out/repositories/user.repository';
import { OutboxEventRepository } from './adapters/out/repositories/outbox-event.repository';
import { AUTH_SERVICE } from './core/interfaces/services/auth-service.interface';
import { USER_SERVICE } from './core/interfaces/services/user-service.interface';
import { TOKEN_SERVICE } from './core/interfaces/services/token-service.interface';
import { USER_REPOSITORY } from './core/interfaces/repositories/user-repository.interface';
import { OUTBOX_EVENT_REPOSITORY } from './core/interfaces/repositories/outbox-event-repository.interface';
import { GOOGLE_OAUTH_SERVICE } from './core/interfaces/external/google-oauth.interface';
import { EVENT_PUBLISHER } from './core/interfaces/external/event-publisher.interface';

@Module({
  imports: [ScheduleModule.forRoot(), JwtModule.register({})],
  controllers: [AuthController, UsersController],
  providers: [
    { provide: AUTH_SERVICE, useClass: AuthService },
    { provide: USER_SERVICE, useClass: UserService },
    { provide: TOKEN_SERVICE, useClass: TokenService },
    { provide: USER_REPOSITORY, useClass: UserRepository },
    { provide: OUTBOX_EVENT_REPOSITORY, useClass: OutboxEventRepository },
    { provide: GOOGLE_OAUTH_SERVICE, useClass: GoogleOAuthService },
    { provide: EVENT_PUBLISHER, useClass: KafkaEventPublisher },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    OutboxRelayService,
    JwtAuthGuard,
  ],
})
export class AuthModule {}
```

- [ ] **Step 5: Wiring dos e2e**

`test/users.e2e-spec.ts` — trocar o import e o lookup:

```typescript
import {
  ITokenService,
  TOKEN_SERVICE,
} from '../src/core/interfaces/services/token-service.interface';
```

```typescript
    tokenService = app.get<ITokenService>(TOKEN_SERVICE);
```

(a variável `let tokenService: TokenService` vira `let tokenService: ITokenService`.)

`test/auth.e2e-spec.ts` e `test/outbox-relay.e2e-spec.ts` — trocar o import do override:

```typescript
import { GOOGLE_OAUTH_SERVICE } from '../src/core/interfaces/external/google-oauth.interface';
```

e:

```typescript
      .overrideProvider(GOOGLE_OAUTH_SERVICE)
```

(o `useValue({...})` de cada um fica idêntico — o mock já tem o shape de `IGoogleOAuthService`.)

- [ ] **Step 6: Gate completo (o mais importante do plano)**

Run: `npx jest` → todas as suítes verdes.
Run: `npx tsc --noEmit -p tsconfig.build.json` → exit 0.
Run: `npx jest --config ./test/jest-e2e.json` → **12/12, sem nenhuma asserção alterada**
(containers de pé). Se algum status code mudou, o filter/exceção correspondente está errado — não
ajustar o teste, ajustar o código.

- [ ] **Step 7: Commit**

```bash
git add -A Micro-services/auth/src Micro-services/auth/test
git commit -m "refactor(auth): move business logic to application layer behind ports with domain exceptions"
```

---

### Task 7: Estrutura final de adapters/in (controllers/, guards/, dtos/)

Movimentação mecânica final — nenhuma mudança de lógica, só `git mv` + ajuste de imports.

**Files:**
- Move: `src/adapters/in/http/auth.controller.ts` → `src/adapters/in/controllers/auth.controller.ts` (+spec)
- Move: `src/adapters/in/http/users.controller.ts` → `src/adapters/in/controllers/users.controller.ts` (+spec)
- Move: `src/adapters/in/http/jwt-auth.guard.ts` → `src/adapters/in/controllers/guards/jwt-auth.guard.ts` (+spec)
- Move: `src/adapters/in/http/dto/refresh-token.dto.ts` → `src/adapters/in/dtos/refresh-token.dto.ts`
- Move: `src/adapters/in/http/express.d.ts` → `src/adapters/in/express.d.ts`
- Modify: `src/auth.module.ts` (caminhos)
- Delete: pasta `src/adapters/in/http/`

- [ ] **Step 1: Mover os arquivos**

```bash
mkdir -p src/adapters/in/controllers/guards
git mv src/adapters/in/http/auth.controller.ts src/adapters/in/controllers/auth.controller.ts
git mv src/adapters/in/http/auth.controller.spec.ts src/adapters/in/controllers/auth.controller.spec.ts
git mv src/adapters/in/http/users.controller.ts src/adapters/in/controllers/users.controller.ts
git mv src/adapters/in/http/users.controller.spec.ts src/adapters/in/controllers/users.controller.spec.ts
git mv src/adapters/in/http/jwt-auth.guard.ts src/adapters/in/controllers/guards/jwt-auth.guard.ts
git mv src/adapters/in/http/jwt-auth.guard.spec.ts src/adapters/in/controllers/guards/jwt-auth.guard.spec.ts
git mv src/adapters/in/http/dto/refresh-token.dto.ts src/adapters/in/dtos/refresh-token.dto.ts
git mv src/adapters/in/http/express.d.ts src/adapters/in/express.d.ts
rmdir src/adapters/in/http/dto src/adapters/in/http
```

- [ ] **Step 2: Ajustar imports**

`src/adapters/in/controllers/auth.controller.ts` (mesma profundidade que `http/` — 3 níveis; só os
imports de DTO mudam, agora ambos em `../dtos/`):

```typescript
import { RefreshTokenDto } from '../dtos/refresh-token.dto';
```

(o import de `LoginResponseDto` já era `../dtos/login-response.dto` — permanece.)

`src/adapters/in/controllers/users.controller.ts` — o guard agora é subpasta:

```typescript
import { JwtAuthGuard } from './guards/jwt-auth.guard';
```

(demais imports inalterados — mesma profundidade.)

`src/adapters/in/controllers/guards/jwt-auth.guard.ts` — um nível mais fundo (4):

```typescript
import {
  ITokenService,
  TOKEN_SERVICE,
} from '../../../../core/interfaces/services/token-service.interface';
```

`src/adapters/in/controllers/guards/jwt-auth.guard.spec.ts`:

```typescript
import { ITokenService } from '../../../../core/interfaces/services/token-service.interface';
```

`src/adapters/in/express.d.ts` — um nível mais raso (2):

```typescript
import { AccessTokenPayload } from '../../core/interfaces/services/token-service.interface';
```

`src/auth.module.ts` — caminhos novos:

```typescript
import { AuthController } from './adapters/in/controllers/auth.controller';
import { UsersController } from './adapters/in/controllers/users.controller';
import { JwtAuthGuard } from './adapters/in/controllers/guards/jwt-auth.guard';
```

- [ ] **Step 3: Gate completo**

Run: `npx jest`; `npx tsc --noEmit -p tsconfig.build.json`; `npx jest --config ./test/jest-e2e.json`.
Expected: tudo verde, 12/12 e2e.

- [ ] **Step 4: Commit**

```bash
git add -A Micro-services/auth/src
git commit -m "refactor(auth): final in-adapter layout (controllers/, guards/, dtos/)"
```

---

### Task 8: Verificação de camadas + docs

- [ ] **Step 1: Greps de violação de camada (todos devem retornar vazio)**

Run (de `Micro-services/auth/src`):

```bash
# core não importa nada de fora de core (nem NestJS):
grep -rn "from '\.\./\.\./application\|from '\.\./\.\./adapters\|@nestjs" core/ || echo OK-core
# application não importa adapters (única exceção: mappers → adapters/in/dtos):
grep -rn "adapters" application/services/ || echo OK-app-services
grep -rn "adapters" application/mappers/ | grep -v "adapters/in/dtos" || echo OK-mappers
# controllers não tocam Prisma/Kafka:
grep -rn "PrismaService\|KafkaProducer" adapters/in/ || echo OK-in
```

Expected: as quatro linhas `OK-*` (nenhum match de violação).

- [ ] **Step 2: Gate final completo**

Run: `npx jest && npx tsc --noEmit -p tsconfig.build.json && npx jest --config ./test/jest-e2e.json`
Expected: tudo verde.

- [ ] **Step 3: Atualizar docs/STATE.md**

Na seção "Decisões de arquitetura (referência rápida)", adicionar ao final da lista:

```markdown
- **Estrutura de pastas hexagonal padronizada** (definida e aplicada no auth em 2026-07-10):
  `core/{entities,exceptions,interfaces/{services,external,repositories}}` (puro, Symbols de DI),
  `application/{services,mappers}` (lógica de negócio), `adapters/in/{controllers/guards,filters,dtos}`,
  `adapters/out/{repositories,external,database,messaging}`. Exception filter global traduz exceção
  de domínio → HTTP. Os outros 7 serviços adotam a convenção quando forem implementados. Ver
  `docs/superpowers/specs/2026-07-10-hexagonal-folder-structure-design.md`.
```

- [ ] **Step 4: Commit**

```bash
git add docs/STATE.md
git commit -m "docs: record hexagonal folder convention in project state"
```
