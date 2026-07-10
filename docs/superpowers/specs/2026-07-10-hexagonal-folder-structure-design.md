# Estrutura de pastas hexagonal padrão + refatoração do auth-service

Data: 2026-07-10

## Contexto e problema

O auth-service foi implementado (spec `2026-07-08-api-endpoints-and-events-design.md`, plano
`2026-07-09-auth-foundation.md`) sem seguir a arquitetura de pastas pré-definida do projeto, e com
duas violações de camada reais:

1. **Services em `core/`** (`core/auth/*.service.ts`) importando adapters (`PrismaService`,
   `KafkaProducerService`) — core deveria ser a camada mais interna, sem dependências.
2. **`UsersController` injetando `PrismaService` direto** — controller com acesso a banco.
3. Pasta `adapters/in/http/` que não faz parte do padrão (só confunde).
4. Services lançando exceções HTTP do Nest (`UnauthorizedException` etc.) — acopla a camada de
   aplicação ao transporte HTTP.

Este documento define **a convenção de pastas padrão para todos os 8 microservices** e especifica a
refatoração do auth-service (único com código de negócio hoje) para segui-la. Os outros 7 serviços
adotam a convenção quando forem implementados.

## A convenção (todos os serviços)

```
src/
├── core/                          # camada mais interna: ZERO import de framework ou adapters
│   ├── entities/                  # entidades de domínio (classes/tipos puros)
│   ├── exceptions/                # exceções de domínio (sem HTTP)
│   └── interfaces/
│       ├── services/              # portas de services → implementadas em application/services
│       ├── repositories/          # portas de repos    → implementadas em adapters/out/repositories
│       └── external/              # portas de serviços externos → implementadas em adapters/out/external
├── application/
│   ├── services/                  # implementação dos services — TODA a lógica de negócio
│   └── mappers/                   # conversão DTO ↔ entity
├── adapters/
│   ├── in/                        # tudo que entra
│   │   ├── controllers/           # controllers HTTP (repassam e retornam padrão HTTP, sem lógica)
│   │   │   └── guards/            # guards usados pelos controllers
│   │   ├── filters/               # exception filters globais (domínio → HTTP)
│   │   ├── dtos/                  # DTOs de request/response
│   │   └── express.d.ts           # augmentation de tipos (quando necessário)
│   └── out/                       # tudo que sai
│       ├── repositories/          # implementação Prisma das portas de repositório (sem lógica de negócio)
│       ├── external/              # implementação das portas de serviços externos (Google, publisher Kafka…)
│       ├── database/              # infra Prisma (module + service) — já existe em todos os serviços
│       └── messaging/             # infra Kafka (client/producer/consumer) — já existe em todos os serviços
├── app.module.ts
├── <service>.module.ts            # binding das portas (tokens) + APP_FILTER
└── main.ts
```

### Regras de dependência

- `core` não importa nada de `application` nem `adapters` (nem NestJS além de tipos triviais —
  na prática as interfaces são TS puro + `Symbol` de injeção).
- `application` importa **só `core`** (+ libs in-process como `@nestjs/jwt`, `node:crypto`).
  Nunca importa `adapters/out`. Exceção deliberada e aceita: `application/mappers` importa DTOs de
  `adapters/in/dtos` (padrão pragmático comum em templates hexagonais NestJS).
- `adapters/in` importa portas/exceções de `core` e DTOs próprios. Chama services **via porta**
  (`@Inject(AUTH_SERVICE)`), nunca a classe concreta.
- `adapters/out` implementa portas de `core`; é o único lugar que toca Prisma/Kafka/HTTP externo.
- **Lógica de negócio mora em `application/services`.** Controller repassa; repositório persiste.
- Como interface TS não existe em runtime, **cada arquivo de interface exporta também um `Symbol`**
  (ex: `export const AUTH_SERVICE = Symbol('AUTH_SERVICE')`) e o module do serviço faz o binding
  (`{ provide: AUTH_SERVICE, useClass: AuthService }`).

### Exceções de domínio + filter global

- `core/exceptions/domain.exception.ts` define a base abstrata `DomainException`.
- Services lançam **só exceções de domínio** (ou deixam propagar erro inesperado).
- `adapters/in/filters/domain-exception.filter.ts` (`@Catch(DomainException)`) traduz para HTTP.
  Registrado via **`APP_FILTER` no module do serviço** — não no `main.ts` — para que os apps de
  e2e (que não passam pelo `main.ts`) ganhem o filter automaticamente.
- Exceções que não são de domínio seguem o comportamento default do Nest (`HttpException` passa,
  resto vira 500).
- Guards são código de borda HTTP: podem lançar `UnauthorizedException` do Nest diretamente.

## Refatoração do auth-service

### Árvore alvo completa

```
src/
├── core/
│   ├── entities/
│   │   ├── user.entity.ts                # id, googleId, email, name, avatarUrl, role, createdAt, updatedAt
│   │   └── outbox-event.entity.ts        # id, aggregateType, aggregateId, eventType, payload, createdAt
│   ├── exceptions/
│   │   ├── domain.exception.ts
│   │   ├── invalid-refresh-token.exception.ts
│   │   ├── google-authentication-failed.exception.ts
│   │   ├── email-already-in-use.exception.ts
│   │   └── user-not-found.exception.ts
│   └── interfaces/
│       ├── services/
│       │   ├── auth-service.interface.ts        # IAuthService + AUTH_SERVICE; tipo LoginResult
│       │   ├── token-service.interface.ts       # ITokenService + TOKEN_SERVICE; AccessTokenPayload, TokenPair
│       │   └── user-service.interface.ts        # IUserService + USER_SERVICE
│       ├── repositories/
│       │   ├── user-repository.interface.ts     # IUserRepository + USER_REPOSITORY
│       │   └── outbox-event-repository.interface.ts  # IOutboxEventRepository + OUTBOX_EVENT_REPOSITORY
│       └── external/
│           ├── google-oauth.interface.ts        # IGoogleOAuthService + GOOGLE_OAUTH_SERVICE; GoogleProfile
│           └── event-publisher.interface.ts     # IEventPublisher + EVENT_PUBLISHER
├── application/
│   ├── services/
│   │   ├── auth.service.ts          (+spec)
│   │   ├── user.service.ts          (+spec)  # NOVO — getProfile() pro /users/me
│   │   ├── token.service.ts         (+spec)
│   │   └── outbox-relay.service.ts  (+spec)
│   └── mappers/
│       └── user.mapper.ts           (+spec)  # User entity → UserResponseDto
├── adapters/
│   ├── in/
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts   (+spec)
│   │   │   ├── users.controller.ts  (+spec)
│   │   │   └── guards/
│   │   │       └── jwt-auth.guard.ts (+spec)
│   │   ├── filters/
│   │   │   └── domain-exception.filter.ts (+spec)
│   │   ├── dtos/
│   │   │   ├── refresh-token.dto.ts
│   │   │   ├── login-response.dto.ts
│   │   │   └── user-response.dto.ts
│   │   └── express.d.ts
│   └── out/
│       ├── repositories/
│       │   ├── user.repository.ts           # Prisma; createWithEvent() = $transaction user+outbox
│       │   └── outbox-event.repository.ts   # findPending(limit), markPublished(id)
│       ├── external/
│       │   ├── google-oauth.service.ts (+spec)   # movido de core/auth
│       │   └── kafka-event-publisher.ts          # wrapper fino do KafkaProducerService
│       ├── database/    (inalterado)
│       └── messaging/   (inalterado)
├── app.module.ts        (inalterado)
├── auth.module.ts       (rebinding com tokens + APP_FILTER)
└── main.ts              (inalterado)
```

Pastas removidas: `src/adapters/in/http/`, `src/core/auth/`.

### Mapeamento de movimentações

| De | Para | Mudança além do caminho |
|---|---|---|
| `adapters/in/http/auth.controller.ts` | `adapters/in/controllers/auth.controller.ts` | injeta `@Inject(AUTH_SERVICE) IAuthService`; mapeia `LoginResult.user` → `UserResponseDto` via `UserMapper` |
| `adapters/in/http/users.controller.ts` | `adapters/in/controllers/users.controller.ts` | injeta `USER_SERVICE`; **para de tocar Prisma**; mapeia entity → `UserResponseDto` via `UserMapper` |
| `adapters/in/http/jwt-auth.guard.ts` | `adapters/in/controllers/guards/jwt-auth.guard.ts` | injeta `TOKEN_SERVICE` (porta) |
| `adapters/in/http/express.d.ts` | `adapters/in/express.d.ts` | `AccessTokenPayload` importado de core |
| `adapters/in/http/dto/refresh-token.dto.ts` | `adapters/in/dtos/refresh-token.dto.ts` | — |
| `core/auth/auth.service.ts` | `application/services/auth.service.ts` | ver "Detalhes de comportamento" |
| `core/auth/token.service.ts` | `application/services/token.service.ts` | tipos `AccessTokenPayload`/`TokenPair` movem pra interface em core |
| `core/auth/outbox-relay.service.ts` | `application/services/outbox-relay.service.ts` | injeta `OUTBOX_EVENT_REPOSITORY` + `EVENT_PUBLISHER` em vez de Prisma/Kafka |
| `core/auth/google-oauth.service.ts` | `adapters/out/external/google-oauth.service.ts` | implementa `IGoogleOAuthService`; `GoogleProfile` move pra core |

Todos os `.spec.ts` movem junto e passam a mockar **portas** em vez de Prisma/Kafka crus.

### Detalhes de comportamento (o que muda por dentro, não por fora)

- **AuthService** deixa de importar exceções HTTP do Nest e lança domínio:
  falha na troca do code Google → `GoogleAuthenticationFailedException`; refresh token inválido **ou
  usuário deletado** → `InvalidRefreshTokenException` (os dois casos continuam virando **401** — não
  usar `UserNotFoundException` aqui, senão mudaria para 404); e-mail duplicado (P2002 detectado no
  repositório e relançado como domínio) → `EmailAlreadyInUseException`.
- **Outbox transacional com camadas limpas:** o `AuthService` gera o `id` do usuário
  (`randomUUID()`), monta a entity (com `role: 'CUSTOMER'` — regra de negócio explícita no service,
  não escondida no default do banco) e o payload do `UserRegistered`, e chama
  `userRepository.createWithEvent(user, event)`. O repositório só executa os dois inserts na mesma
  `$transaction` — atomicidade é responsabilidade de persistência, não lógica de negócio.
- **UserService (novo):** `getProfile(userId)` → `findById` → `null` vira
  `UserNotFoundException` (**404**, comportamento atual do controller preservado). Retorna a
  entity `User`.
- **Onde acontece o mapeamento entity → DTO:** no **controller** (via `UserMapper` de
  `application/mappers`). Services retornam entities/tipos de core (`IAuthService.loginWithGoogleCode`
  retorna `LoginResult = { accessToken, refreshToken, user: User }`, definido em core) — assim as
  interfaces em `core` nunca importam DTOs de adapters. Controller → mapper é direção
  outer→inner, permitida; chamar mapper não é lógica de negócio. Shapes dos DTOs:
  `UserResponseDto = { id, email, name, avatarUrl, role }` e
  `LoginResponseDto = { accessToken, refreshToken, user: UserResponseDto }` — idênticos às
  respostas atuais.
- **OutboxRelayService:** mesma lógica (envelope, `eventId = row.id`, guard de reentrância,
  erro deixa PENDING), mas via portas: `IOutboxEventRepository.findPending(20)` /
  `markPublished(id)` e `IEventPublisher.publish(topic, key, value)`.
- **P2002 → domínio:** o `UserRepository` captura `PrismaClientKnownRequestError` P2002 e lança
  `EmailAlreadyInUseException` — tradução de erro de infra para domínio é papel do adapter; o
  filter traduz domínio para HTTP.

### Tabela do filter (domínio → HTTP)

| Exceção de domínio | Status |
|---|---|
| `InvalidRefreshTokenException` | 401 |
| `GoogleAuthenticationFailedException` | 400 |
| `EmailAlreadyInUseException` | 409 |
| `UserNotFoundException` | 404 |
| `DomainException` não mapeada (fallback) | 500 |

### Invariantes (o que NÃO muda)

- Rotas, verbos, status codes e shapes de resposta: idênticos. Os 12 testes e2e passam **sem
  alterar nenhuma asserção de status/body** (única edição permitida nos e2e: resolver
  `TokenService` por token — `app.get(TOKEN_SERVICE)` — em `users.e2e-spec.ts`).
- Envelope Kafka, tópico `auth-events`, partition key, CSRF do OAuth state, cookie httpOnly: intactos.
- `npx tsc --noEmit -p tsconfig.build.json` continua saindo 0 (manter `import type` para
  `Request`/`Response` em arquivos com decorators).
- Suíte completa verde ao final: os 34 testes unitários existentes continuam (adaptados: asserções
  mudam de exceção HTTP para exceção de domínio onde aplicável, e de mock de Prisma/Kafka para mock
  de porta) e somam-se os novos specs (`user.service`, `user.mapper`, `domain-exception.filter`);
  os 12 e2e passam inalterados.

## Fora de escopo

- Refatorar os outros 7 serviços (só têm o esqueleto de infra, que já está no lugar certo da
  convenção: `adapters/out/{database,messaging}`).
- Consumers Kafka como adapters de entrada (`adapters/in/messaging/`) — decidir quando o primeiro
  consumer real for implementado (auth consumirá `SellerOnboarded` na fatia de catalog).
- Extrair guard/filter para pacote npm compartilhado — continua adiado, como no spec de endpoints.
