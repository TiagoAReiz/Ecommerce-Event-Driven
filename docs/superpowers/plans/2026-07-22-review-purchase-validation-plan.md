# Review Purchase Validation + ReviewSent Event + Seller Email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before a review can be created, verify (via a new order-service endpoint) that the authenticated customer actually purchased the product; on creation, publish a `ReviewSent` event through a transactional outbox; have notification-service email the seller with the customer's name, rating, and comment.

**Architecture:** order-service gains a `GET /orders/:id/verify-purchase?productId=` endpoint that reuses its existing `findById` + catalog client to answer eligibility, returning `{ eligible, sellerId }`. review-service gains one new external port (`IOrderClient`) to call that endpoint, a transactional outbox (mirroring payment-service's), and a fixed authorization flow (customerId now comes from the JWT, not the request body). notification-service gains a `catalog-events` consumer (populating a `sellerId -> userId` read-model, same pattern as payment's `SellerPaymentProfile`) and a `review-events` consumer that emails the seller.

**Tech Stack:** NestJS 11, Prisma (review-service uses the newer `prisma-client` generator + `generated/prisma/client` import path; order/notification use `@prisma/client`), Jest 30 + ts-jest, `@confluentinc/kafka-javascript`, native `fetch`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-21-review-purchase-validation-design.md` — every task below implements a section of it; re-read it if a step's rationale is unclear.
- Follow existing per-service conventions exactly (hexagonal folders: `core/entities`, `core/interfaces`, `core/exceptions`, `application/services`, `adapters/in`, `adapters/out`). Do not introduce new folder structures.
- No test hits a real database or a real Kafka broker — every existing spec in this repo mocks the Prisma client / repository / Kafka consumer with plain `jest.fn()` objects, cast `as any`. Match that style exactly; do not add `@nestjs/testing`'s `TestingModule` where the codebase doesn't already use it (only `review.controller.spec.ts` uses it today — for consistency within review-service, follow whichever style each file you touch already uses).
- Money/decimal fields are always strings (`toFixed(2)`), never floats. Not directly relevant to new code here (no money fields), but don't regress this if you touch `order.service.ts`.
- `DomainException` subclasses are the only exceptions a controller should let escape to a client; each service's `DomainExceptionFilter` (`@Catch(DomainException)`) translates them to HTTP. Any new domain exception must be added to the relevant filter's `toHttp` — a domain exception with no filter branch falls through to `500`, which is a bug.
- Kafka consumers (`adapters/in/messaging/*-events.consumer.ts`) must silently ignore unknown `eventType`s (`default: return;` in the `switch`) — never throw on an unrecognized event.
- review-service is the outlier: no `app.setGlobalPrefix('api/v1')` in `main.ts` (every other service has it), and its `DATABASE_URL` points at a local `prisma+postgres://localhost:51213` dev server, not the docker-compose Postgres the other 7 services use. Both are pre-existing gaps, out of scope for this plan — don't "fix" them. But: order-service's HTTP surface **is** prefixed, so review's new `OrderHttpClient` must call `.../api/v1/orders/...`.

---

## Pre-flight: verify review-service's migration path works (do this before Task 1)

review-service has **never** run a real Prisma migration, and its `DATABASE_URL` (`prisma+postgres://localhost:51213/...`) points at Prisma's local dev-server format, not the docker-compose Postgres every other service uses. Tasks 5 through 11 (all of review-service's work) are blocked on Task 4's migration bootstrap succeeding, so confirm this works **now**, before writing any code — not 8 tasks deep, after other work is already stacked on top of it.

- [ ] Run: `cd Micro-services/review && npx prisma db pull --print 2>&1 | head -5`
- [ ] If it errors with something like `Can't reach database server`, start the local dev server: `npx prisma dev` (run it in the background — it needs to stay up for the rest of the review-service work), then retry the command above until it prints the introspected `Review` model.
- [ ] Run: `cd Micro-services/review && npx prisma migrate dev --name init --create-only` (the `--create-only` flag generates the migration SQL without applying it, so you can inspect it before committing to Task 4's real bootstrap). Confirm it produces a plausible `CREATE TABLE "Review" (...)` and does **not** report unresolvable drift.
- [ ] If it reports drift you can't reconcile (e.g. a live `Review` table with rows that don't match the schema), stop and flag it to the user before proceeding — don't reset the dev database unilaterally.
- [ ] Delete the `--create-only` migration folder this check produced (it was just a dry run; Task 4 will generate the real one): `rm -rf prisma/migrations` if the directory it created is empty of anything else.

---

## Task 1: order-service — `ICatalogClient.getProductVariantIds`

**Files:**
- Modify: `Micro-services/order/src/core/interfaces/external/catalog-client.interface.ts`
- Modify: `Micro-services/order/src/adapters/out/external/catalog-http-client.ts`
- Test: `Micro-services/order/src/adapters/out/external/catalog-http-client.spec.ts` (new file — none exists today for this class; only the interface is exercised indirectly via `order.service.spec.ts`'s mock)

**Interfaces:**
- Consumes: nothing new — reuses the private `get(path, accessToken)` helper already in `CatalogHttpClient`, and the existing `CatalogUnavailableException` from `../../../core/exceptions/catalog-unavailable.exception`.
- Produces: `ICatalogClient.getProductVariantIds(productId: string, accessToken: string): Promise<string[] | null>` — `null` when the product doesn't exist (catalog 404), otherwise the list of `ProductVariant.id` values for that product (from catalog's `GET /products/:id`, whose JSON shape is `{ ..., variants: [{ id, productId, sku, ... }] }` — the field is `id`, **not** `variantId`; that naming only applies to the separate `/variants/:id` endpoint). Task 2 depends on this method.

- [ ] **Step 1: Write the failing test**

```ts
// Micro-services/order/src/adapters/out/external/catalog-http-client.spec.ts
import { CatalogHttpClient } from './catalog-http-client';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('CatalogHttpClient.getProductVariantIds', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns the variant ids from GET /products/:id', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        id: 'prod-1',
        variants: [{ id: 'variant-1' }, { id: 'variant-2' }],
      }),
    ) as any;
    const client = new CatalogHttpClient();

    const result = await client.getProductVariantIds('prod-1', 'token-1');

    expect(result).toEqual(['variant-1', 'variant-2']);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3003/api/v1/products/prod-1',
      { method: 'GET', headers: { Authorization: 'Bearer token-1' } },
    );
  });

  it('returns null when the product does not exist (404)', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(404, {})) as any;
    const client = new CatalogHttpClient();

    const result = await client.getProductVariantIds('missing', 'token-1');

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Micro-services/order && npx jest catalog-http-client.spec.ts`
Expected: FAIL — `client.getProductVariantIds is not a function`.

- [ ] **Step 3: Implement**

In `Micro-services/order/src/core/interfaces/external/catalog-client.interface.ts`, add the method to the interface (keep `CatalogVariant`/`CatalogSeller`/`getVariant`/`getMySeller` unchanged):

```ts
export interface ICatalogClient {
  /** `GET /variants/:id` (público). `null` quando a variant não existe (404 do catalog). */
  getVariant(variantId: string, accessToken: string): Promise<CatalogVariant | null>;
  /** `GET /sellers/me` (JWT+ownership). `null` quando o usuário não tem seller (404 do catalog). */
  getMySeller(accessToken: string): Promise<CatalogSeller | null>;
  /**
   * `GET /products/:id` (público). Devolve os ids das variants do produto (usado por
   * `OrderService.verifyPurchase` pra cruzar com `OrderItem.variantId`). `null` quando o produto
   * não existe (404 do catalog).
   */
  getProductVariantIds(productId: string, accessToken: string): Promise<string[] | null>;
}
```

In `Micro-services/order/src/adapters/out/external/catalog-http-client.ts`, add the method to the class, reusing the existing private `get()` helper:

```ts
  async getProductVariantIds(productId: string, accessToken: string): Promise<string[] | null> {
    const response = await this.get(`/products/${productId}`, accessToken);
    if (response.status === 404) return null;
    if (!response.ok) throw new CatalogUnavailableException();

    const body = (await response.json()) as { variants: { id: string }[] };
    return body.variants.map((v) => v.id);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Micro-services/order && npx jest catalog-http-client.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd Micro-services/order
git add src/core/interfaces/external/catalog-client.interface.ts src/adapters/out/external/catalog-http-client.ts src/adapters/out/external/catalog-http-client.spec.ts
git commit -m "feat(order): add ICatalogClient.getProductVariantIds"
```

---

## Task 2: order-service — `OrderService.verifyPurchase`

**Files:**
- Modify: `Micro-services/order/src/core/interfaces/services/order-service.interface.ts`
- Modify: `Micro-services/order/src/application/services/order.service.ts`
- Modify: `Micro-services/order/src/application/services/order.service.spec.ts`

**Interfaces:**
- Consumes: `this.orderRepository.findById(orderId): Promise<OrderWithSubOrders | null>` (existing), `this.catalogClient.getProductVariantIds(productId, accessToken): Promise<string[] | null>` (Task 1), `OrderNotFoundException`, `OrderAccessDeniedException` (existing, both already mapped to 404/403 in `domain-exception.filter.ts` — no filter change needed).
- Produces: exported type `PurchaseVerification = { eligible: true; sellerId: string } | { eligible: false }` (in `order-service.interface.ts`) and `IOrderService.verifyPurchase(userId: string, orderId: string, productId: string, accessToken: string): Promise<PurchaseVerification>`. Task 3's controller and, indirectly, review-service's `OrderHttpClient` (Task 7) rely on this exact JSON shape (`{ eligible: boolean, sellerId?: string }`).

- [ ] **Step 1: Write the failing tests**

Add to `Micro-services/order/src/application/services/order.service.spec.ts` (new `describe` block, alongside the existing ones — keep all existing tests untouched):

```ts
  describe('verifyPurchase', () => {
    it('throws OrderNotFoundException when the order does not exist', async () => {
      const { service, orderRepository } = buildService();
      orderRepository.findById.mockResolvedValue(null);

      await expect(service.verifyPurchase('user-1', 'order-1', 'prod-1', 'token-1')).rejects.toThrow(
        OrderNotFoundException,
      );
    });

    it('throws OrderAccessDeniedException when the order belongs to another user', async () => {
      const { service, orderRepository } = buildService();
      orderRepository.findById.mockResolvedValue({ order: buildOrder({ userId: 'someone-else' }), subOrders: [] });

      await expect(service.verifyPurchase('user-1', 'order-1', 'prod-1', 'token-1')).rejects.toThrow(
        OrderAccessDeniedException,
      );
    });

    it('is not eligible when the order is not COMPLETED yet', async () => {
      const { service, orderRepository, catalogClient } = buildService();
      orderRepository.findById.mockResolvedValue({
        order: buildOrder({ userId: 'user-1', status: 'PAID' }),
        subOrders: [{ subOrder: buildSubOrder({ sellerId: 'seller-1' }), items: [{ variantId: 'v-1' } as OrderItem] }],
      });

      const result = await service.verifyPurchase('user-1', 'order-1', 'prod-1', 'token-1');

      expect(result).toEqual({ eligible: false });
      expect(catalogClient.getProductVariantIds).not.toHaveBeenCalled();
    });

    it('is not eligible when the product does not exist in the catalog', async () => {
      const { service, orderRepository, catalogClient } = buildService();
      orderRepository.findById.mockResolvedValue({
        order: buildOrder({ userId: 'user-1', status: 'COMPLETED' }),
        subOrders: [{ subOrder: buildSubOrder({ sellerId: 'seller-1' }), items: [{ variantId: 'v-1' } as OrderItem] }],
      });
      catalogClient.getProductVariantIds.mockResolvedValue(null);

      const result = await service.verifyPurchase('user-1', 'order-1', 'prod-missing', 'token-1');

      expect(result).toEqual({ eligible: false });
    });

    it('is not eligible when none of the order items match the product variants', async () => {
      const { service, orderRepository, catalogClient } = buildService();
      orderRepository.findById.mockResolvedValue({
        order: buildOrder({ userId: 'user-1', status: 'COMPLETED' }),
        subOrders: [{ subOrder: buildSubOrder({ sellerId: 'seller-1' }), items: [{ variantId: 'v-1' } as OrderItem] }],
      });
      catalogClient.getProductVariantIds.mockResolvedValue(['v-other']);

      const result = await service.verifyPurchase('user-1', 'order-1', 'prod-1', 'token-1');

      expect(result).toEqual({ eligible: false });
    });

    it('is eligible and returns the sellerId when a sub-order item matches a product variant', async () => {
      const { service, orderRepository, catalogClient } = buildService();
      orderRepository.findById.mockResolvedValue({
        order: buildOrder({ userId: 'user-1', status: 'COMPLETED' }),
        subOrders: [
          { subOrder: buildSubOrder({ sellerId: 'seller-A' }), items: [{ variantId: 'v-1' } as OrderItem] },
          { subOrder: buildSubOrder({ sellerId: 'seller-B' }), items: [{ variantId: 'v-2' } as OrderItem] },
        ],
      });
      catalogClient.getProductVariantIds.mockResolvedValue(['v-2']);

      const result = await service.verifyPurchase('user-1', 'order-1', 'prod-1', 'token-1');

      expect(result).toEqual({ eligible: true, sellerId: 'seller-B' });
      expect(catalogClient.getProductVariantIds).toHaveBeenCalledWith('prod-1', 'token-1');
    });
  });
```

Also update `buildService()`'s `catalogClient` mock to include the new method:

```ts
  const catalogClient = { getVariant: jest.fn(), getMySeller: jest.fn(), getProductVariantIds: jest.fn() } as any;
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Micro-services/order && npx jest order.service.spec.ts`
Expected: FAIL — `service.verifyPurchase is not a function`.

- [ ] **Step 3: Implement**

In `Micro-services/order/src/core/interfaces/services/order-service.interface.ts`, add the type and method:

```ts
export type PurchaseVerification = { eligible: true; sellerId: string } | { eligible: false };

export interface IOrderService {
  // ... existing methods unchanged ...

  /**
   * `GET /orders/:id/verify-purchase?productId=`. Elegível quando o pedido pertence ao usuário,
   * está `COMPLETED`, e algum item de algum sub-order corresponde a uma variant do `productId`
   * informado (resolvido via catalog `GET /products/:id`).
   */
  verifyPurchase(
    userId: string,
    orderId: string,
    productId: string,
    accessToken: string,
  ): Promise<PurchaseVerification>;
}
```

In `Micro-services/order/src/application/services/order.service.ts`, add the method right after `getById` (and add `PurchaseVerification` to the type-only import from `../../core/interfaces/services/order-service.interface` — note that file doesn't currently import anything from its own interface, so add a fresh `import type { PurchaseVerification } from '../../core/interfaces/services/order-service.interface';`):

```ts
  async verifyPurchase(
    userId: string,
    orderId: string,
    productId: string,
    accessToken: string,
  ): Promise<PurchaseVerification> {
    const found = await this.orderRepository.findById(orderId);
    if (!found) throw new OrderNotFoundException();
    if (found.order.userId !== userId) throw new OrderAccessDeniedException();

    if (found.order.status !== 'COMPLETED') {
      return { eligible: false };
    }

    const variantIds = await this.catalogClient.getProductVariantIds(productId, accessToken);
    if (!variantIds || variantIds.length === 0) {
      return { eligible: false };
    }

    const variantIdSet = new Set(variantIds);
    for (const { subOrder, items } of found.subOrders) {
      if (items.some((item) => variantIdSet.has(item.variantId))) {
        return { eligible: true, sellerId: subOrder.sellerId };
      }
    }

    return { eligible: false };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd Micro-services/order && npx jest order.service.spec.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Commit**

```bash
cd Micro-services/order
git add src/core/interfaces/services/order-service.interface.ts src/application/services/order.service.ts src/application/services/order.service.spec.ts
git commit -m "feat(order): add OrderService.verifyPurchase for review eligibility"
```

---

## Task 3: order-service — `GET /orders/:id/verify-purchase` endpoint

**Files:**
- Create: `Micro-services/order/src/adapters/in/controllers/dtos/verify-purchase-response.dto.ts`
- Modify: `Micro-services/order/src/adapters/in/controllers/orders.controller.ts`
- Create: `Micro-services/order/src/adapters/in/controllers/orders.controller.spec.ts` (no controller spec exists for this class today — only add coverage for the new endpoint, don't retrofit tests for `checkout`/`list`/`getById`/`cancel`, that's out of scope)

**Interfaces:**
- Consumes: `IOrderService.verifyPurchase` (Task 2), `request.user!.sub` (populated by `JwtAuthGuard`, already applied at the controller class level via `@UseGuards(JwtAuthGuard)`), the controller's own private `extractBearerToken` (already exists, copy the exact pattern — do not extract it into a shared util).
- Produces: `GET /api/v1/orders/:id/verify-purchase?productId=<id>` → `VerifyPurchaseResponseDto { eligible: boolean; sellerId?: string }`. review-service's `OrderHttpClient` (Task 7) is the consumer of this HTTP contract.

- [ ] **Step 1: Write the failing test**

```ts
// Micro-services/order/src/adapters/in/controllers/dtos/verify-purchase-response.dto.ts does not exist yet,
// so first write the controller spec (it will fail to compile/import until Step 3 creates the DTO + method).
```

```ts
// Micro-services/order/src/adapters/in/controllers/orders.controller.spec.ts
import { BadRequestException } from '@nestjs/common';
import { OrdersController } from './orders.controller';

function build() {
  const orderService = {
    checkout: jest.fn(),
    listByUser: jest.fn(),
    getById: jest.fn(),
    cancel: jest.fn(),
    verifyPurchase: jest.fn(),
  };
  return { controller: new OrdersController(orderService as any), orderService };
}

function requestWith(userId: string, bearer = 'token-1') {
  return {
    user: { sub: userId },
    headers: { authorization: `Bearer ${bearer}` },
  } as any;
}

describe('OrdersController.verifyPurchase', () => {
  it('throws BadRequestException when productId query param is missing', async () => {
    const { controller } = build();

    await expect(
      controller.verifyPurchase(requestWith('user-1'), 'order-1', undefined),
    ).rejects.toThrow(BadRequestException);
  });

  it('delegates to OrderService.verifyPurchase with userId, orderId, productId and the bearer token', async () => {
    const { controller, orderService } = build();
    orderService.verifyPurchase.mockResolvedValue({ eligible: true, sellerId: 'seller-1' });

    const result = await controller.verifyPurchase(requestWith('user-1', 'token-1'), 'order-1', 'prod-1');

    expect(orderService.verifyPurchase).toHaveBeenCalledWith('user-1', 'order-1', 'prod-1', 'token-1');
    expect(result).toEqual({ eligible: true, sellerId: 'seller-1' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Micro-services/order && npx jest orders.controller.spec.ts`
Expected: FAIL — `controller.verifyPurchase is not a function`.

- [ ] **Step 3: Implement**

Create `Micro-services/order/src/adapters/in/controllers/dtos/verify-purchase-response.dto.ts`:

```ts
export class VerifyPurchaseResponseDto {
  eligible!: boolean;
  sellerId?: string;
}
```

In `Micro-services/order/src/adapters/in/controllers/orders.controller.ts`, add the `Query` import is already present; add the DTO import and the new endpoint (place it after `getById`, before `cancel`):

```ts
import type { VerifyPurchaseResponseDto } from './dtos/verify-purchase-response.dto';
```

```ts
  @Get(':id/verify-purchase')
  async verifyPurchase(
    @Req() request: Request,
    @Param('id') id: string,
    @Query('productId') productId?: string,
  ): Promise<VerifyPurchaseResponseDto> {
    if (!productId) {
      throw new BadRequestException('productId is required');
    }
    const accessToken = this.extractBearerToken(request);
    return this.orderService.verifyPurchase(request.user!.sub, id, productId, accessToken);
  }
```

Note: NestJS route matching is order-sensitive for literal segments vs `:id` — `:id/verify-purchase` is a more specific literal suffix than the bare `:id` used by `getById`'s `@Get(':id')`, and NestJS's Express adapter matches by declaration order for overlapping patterns only when both are pure `:id`; here `:id/verify-purchase` has an extra path segment so it cannot collide with `@Get(':id')` (different segment count) or `@Post(':id/cancel')` (different HTTP method + last segment). No reordering of existing routes needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Micro-services/order && npx jest orders.controller.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Manually verify the route is wired (optional but recommended)**

Run: `cd Micro-services/order && npm run build`
Expected: compiles with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
cd Micro-services/order
git add src/adapters/in/controllers/dtos/verify-purchase-response.dto.ts src/adapters/in/controllers/orders.controller.ts src/adapters/in/controllers/orders.controller.spec.ts
git commit -m "feat(order): add GET /orders/:id/verify-purchase endpoint"
```

---

## Task 4: review-service — bootstrap Prisma migrations + add `OutboxEvent`

**Files:**
- Modify: `Micro-services/review/prisma/schema.prisma`
- Create: `Micro-services/review/prisma/migrations/*` (generated by the `prisma migrate dev` commands below — do not hand-write migration SQL)

**Interfaces:**
- Consumes: nothing.
- Produces: an `OutboxEvent` Postgres table + `OutboxStatus` enum in the review-db, matching payment-db's shape exactly (`id`, `aggregateType`, `aggregateId`, `eventType`, `payload` Json, `status` OutboxStatus @default(PENDING), `createdAt`, `updatedAt`, `publishedAt`). Task 5's `OutboxEventRepository` depends on this table existing and on the generated Prisma client (`generated/prisma/client`) exposing `prisma.outboxEvent.*` and `Prisma.InputJsonValue`.

review-service is the one service in this repo with **no migrations directory at all** (`review/prisma/migrations` doesn't exist) — every other service (`payment`, `order`, `notification`) has real `prisma migrate dev`-generated migrations checked into git. This task establishes that baseline for review-service before adding the new table, instead of silently drifting further out of the repo's convention.

- [ ] **Step 1: Confirm the local Prisma dev database is reachable**

`review/.env`'s `DATABASE_URL` is `prisma+postgres://localhost:51213/...` — Prisma's local dev-server format (started via `npx prisma dev`), not the plain `postgresql://` connection string every other service uses.

Run: `cd Micro-services/review && npx prisma db pull --print 2>&1 | head -5`
Expected: either prints the introspected `Review` model (server is up), or an error like `Can't reach database server`. If it's the latter, start the local dev server first: `npx prisma dev` (leave it running in a separate terminal/background process), then retry the command above until it succeeds.

- [ ] **Step 2: Baseline migration capturing the existing `Review` table**

Run: `cd Micro-services/review && npx prisma migrate dev --name init`
Expected: Prisma detects the schema (just the `Review` model, unchanged) and either creates `prisma/migrations/<timestamp>_init/migration.sql` cleanly, or — if the live dev DB already has a `Review` table from earlier ad-hoc `db push` use — prompts about drift. If prompted about drift/reset, inspect the diff it shows first; if it's purely additive (no data you'd lose in this dev environment), accept it. This is a one-time bootstrap, not a repeatable step.

- [ ] **Step 3: Add `OutboxEvent` to the schema**

Edit `Micro-services/review/prisma/schema.prisma`, appending after the `Review` model:

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
}

enum OutboxStatus {
  PENDING
  PUBLISHED
  FAILED
}
```

- [ ] **Step 4: Generate the migration**

Run: `cd Micro-services/review && npx prisma migrate dev --name add_outbox_event`
Expected: creates `prisma/migrations/<timestamp>_add_outbox_event/migration.sql` containing `CREATE TABLE "OutboxEvent" (...)` and `CREATE TYPE "OutboxStatus" AS ENUM (...)`, applies it, and regenerates the Prisma client at `generated/prisma/` (confirm `generated/prisma/models/OutboxEvent.ts` or equivalent now exists — the exact file layout mirrors `generated/prisma/models/Review.ts`, already present).

- [ ] **Step 5: Verify the client compiles against the new model**

Run: `cd Micro-services/review && npx tsc --noEmit -p tsconfig.json`
Expected: no errors (this only exercises the generated types, since no application code references `OutboxEvent` yet — that's Task 5).

- [ ] **Step 6: Commit**

```bash
cd Micro-services/review
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(review): bootstrap Prisma migrations and add OutboxEvent table"
```

---

## Task 5: review-service — outbox infrastructure (entity, repository, relay)

**Files:**
- Create: `Micro-services/review/src/core/entities/outbox-event.entity.ts`
- Create: `Micro-services/review/src/core/interfaces/repositories/outbox-event-repository.interface.ts`
- Create: `Micro-services/review/src/adapters/out/repositories/outbox-event.repository.ts`
- Create: `Micro-services/review/src/application/services/outbox-relay.service.ts`
- Create: `Micro-services/review/src/application/services/outbox-relay.service.spec.ts`

**Interfaces:**
- Consumes: `OutboxEvent`/`OutboxStatus` Prisma model (Task 4), `PrismaService` (`review/src/adapters/out/database/prisma.service.ts`, already `$transaction`-capable — no change needed), `IEventPublisher`/`EVENT_PUBLISHER` (already exists at `review/src/core/interfaces/external/event-publisher.interface.ts`, already wired to `KafkaEventPublisher` in `review.module.ts`).
- Produces: `OUTBOX_EVENT_REPOSITORY` token + `IOutboxEventRepository { findPending(limit): Promise<OutboxEvent[]>; markPublished(id): Promise<void>; }`, `OutboxEventRepository` (Prisma impl), `OutboxRelayService` (the `@Interval(5000)` class, publishing to `review-events`). Task 9 (`ReviewRepository.save`) writes rows this repository later reads; Task 11 (module wiring) registers all of these as providers.

This is a structural mirror of payment-service's outbox (`payment/src/core/entities/outbox-event.entity.ts`, `payment/src/core/interfaces/repositories/outbox-event-repository.interface.ts`, `payment/src/adapters/out/repositories/outbox-event.repository.ts`, `payment/src/application/services/outbox-relay.service.ts`), adjusted only for review-service's import paths (`generated/prisma/client` instead of `@prisma/client`) and topic name (`review-events` instead of `payment-events`).

- [ ] **Step 1: Write the failing test for the relay**

```ts
// Micro-services/review/src/application/services/outbox-relay.service.spec.ts
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxEvent } from '../../core/entities/outbox-event.entity';

function build() {
  const outboxRepository = { findPending: jest.fn(), markPublished: jest.fn() };
  const eventPublisher = { publish: jest.fn() };
  const service = new OutboxRelayService(outboxRepository as any, eventPublisher as any);
  return { service, outboxRepository, eventPublisher };
}

describe('OutboxRelayService', () => {
  it('publishes each pending event to review-events keyed by aggregateId (reviewId) and marks it published', async () => {
    const { service, outboxRepository, eventPublisher } = build();
    const event = new OutboxEvent({
      id: 'evt-1',
      aggregateType: 'Review',
      aggregateId: 'review-1',
      eventType: 'ReviewSent',
      payload: { reviewId: 'review-1' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    outboxRepository.findPending.mockResolvedValue([event]);

    await service.relayPendingEvents();

    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    const [topic, key, value] = eventPublisher.publish.mock.calls[0];
    expect(topic).toBe('review-events');
    expect(key).toBe('review-1');
    const envelope = JSON.parse(value);
    expect(envelope).toMatchObject({
      eventId: 'evt-1',
      eventType: 'ReviewSent',
      aggregateType: 'Review',
      aggregateId: 'review-1',
      version: 1,
      payload: { reviewId: 'review-1' },
    });
    expect(outboxRepository.markPublished).toHaveBeenCalledWith('evt-1');
  });

  it('does not mark published when publishing throws', async () => {
    const { service, outboxRepository, eventPublisher } = build();
    outboxRepository.findPending.mockResolvedValue([
      new OutboxEvent({
        id: 'evt-1',
        aggregateType: 'Review',
        aggregateId: 'review-1',
        eventType: 'ReviewSent',
        payload: {},
        createdAt: new Date(),
      }),
    ]);
    eventPublisher.publish.mockRejectedValue(new Error('broker down'));

    await service.relayPendingEvents();

    expect(outboxRepository.markPublished).not.toHaveBeenCalled();
  });

  it('does not run concurrently with itself (re-entrancy guard)', async () => {
    const { service, outboxRepository } = build();
    let resolveFind: (v: unknown) => void = () => {};
    outboxRepository.findPending.mockImplementation(
      () => new Promise((resolve) => (resolveFind = resolve)),
    );

    const first = service.relayPendingEvents();
    await service.relayPendingEvents();
    expect(outboxRepository.findPending).toHaveBeenCalledTimes(1);

    resolveFind([]);
    await first;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Micro-services/review && npx jest outbox-relay.service.spec.ts`
Expected: FAIL — cannot find module `./outbox-relay.service`.

- [ ] **Step 3: Implement the entity**

```ts
// Micro-services/review/src/core/entities/outbox-event.entity.ts
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

- [ ] **Step 4: Implement the repository interface**

```ts
// Micro-services/review/src/core/interfaces/repositories/outbox-event-repository.interface.ts
import { OutboxEvent } from '../../entities/outbox-event.entity';

export const OUTBOX_EVENT_REPOSITORY = Symbol('OUTBOX_EVENT_REPOSITORY');

export interface IOutboxEventRepository {
  /** Retorna até `limit` eventos PENDING, mais antigos primeiro. */
  findPending(limit: number): Promise<OutboxEvent[]>;
  /** Marca o evento como PUBLISHED com publishedAt = agora. */
  markPublished(id: string): Promise<void>;
}
```

- [ ] **Step 5: Implement the Prisma repository**

```ts
// Micro-services/review/src/adapters/out/repositories/outbox-event.repository.ts
import { Injectable } from '@nestjs/common';
import type { OutboxEvent as PrismaOutboxEvent } from 'generated/prisma/client';
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

- [ ] **Step 6: Implement the relay service**

```ts
// Micro-services/review/src/application/services/outbox-relay.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OutboxEvent } from '../../core/entities/outbox-event.entity';
import { OUTBOX_EVENT_REPOSITORY } from '../../core/interfaces/repositories/outbox-event-repository.interface';
import type { IOutboxEventRepository } from '../../core/interfaces/repositories/outbox-event-repository.interface';
import { EVENT_PUBLISHER } from '../../core/interfaces/external/event-publisher.interface';
import type { IEventPublisher } from '../../core/interfaces/external/event-publisher.interface';

const REVIEW_EVENTS_TOPIC = 'review-events';
const POLL_BATCH_SIZE = 20;

// Transactional Outbox relay: varre eventos PENDING gravados na mesma transação da criação da
// Review e os publica em `review-events` (key = aggregateId = reviewId). Mesmo padrão do
// outbox-relay.service.ts do payment-service.
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
      await this.eventPublisher.publish(
        REVIEW_EVENTS_TOPIC,
        event.aggregateId,
        JSON.stringify(envelope),
      );
      await this.outboxRepository.markPublished(event.id);
    } catch (error) {
      this.logger.error(`Failed to relay outbox event ${event.id}`, error as Error);
    }
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd Micro-services/review && npx jest outbox-relay.service.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
cd Micro-services/review
git add src/core/entities/outbox-event.entity.ts src/core/interfaces/repositories/outbox-event-repository.interface.ts src/adapters/out/repositories/outbox-event.repository.ts src/application/services/outbox-relay.service.ts src/application/services/outbox-relay.service.spec.ts
git commit -m "feat(review): add transactional outbox infrastructure (mirrors payment-service)"
```

---

## Task 6: review-service — domain exceptions + filter

**Files:**
- Create: `Micro-services/review/src/core/exceptions/domain.exception.ts`
- Create: `Micro-services/review/src/core/exceptions/product-not-purchased.exception.ts`
- Create: `Micro-services/review/src/core/exceptions/order-service-unavailable.exception.ts`
- Create: `Micro-services/review/src/adapters/in/filters/domain-exception.filter.ts`
- Create: `Micro-services/review/src/adapters/in/filters/domain-exception.filter.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `DomainException` (abstract base, review-service didn't have one — `core/exceptions/` doesn't exist yet in this service), `ProductNotPurchasedException`, `OrderServiceUnavailableException`, and `DomainExceptionFilter` (`@Catch(DomainException)`, mapping `ProductNotPurchasedException` → 403, `OrderServiceUnavailableException` → 503). Task 7 (`OrderHttpClient`) throws `OrderServiceUnavailableException`; Task 8 (`ReviewService`) throws `ProductNotPurchasedException`; Task 11 registers this filter via `APP_FILTER` in `review.module.ts`.

- [ ] **Step 1: Write the failing test for the filter**

```ts
// Micro-services/review/src/adapters/in/filters/domain-exception.filter.spec.ts
import { ArgumentsHost } from '@nestjs/common';
import { DomainExceptionFilter } from './domain-exception.filter';
import { ProductNotPurchasedException } from '../../../core/exceptions/product-not-purchased.exception';
import { OrderServiceUnavailableException } from '../../../core/exceptions/order-service-unavailable.exception';

function buildHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('DomainExceptionFilter', () => {
  it('maps ProductNotPurchasedException to 403', () => {
    const filter = new DomainExceptionFilter();
    const { host, status } = buildHost();

    filter.catch(new ProductNotPurchasedException(), host);

    expect(status).toHaveBeenCalledWith(403);
  });

  it('maps OrderServiceUnavailableException to 503', () => {
    const filter = new DomainExceptionFilter();
    const { host, status } = buildHost();

    filter.catch(new OrderServiceUnavailableException(), host);

    expect(status).toHaveBeenCalledWith(503);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Micro-services/review && npx jest domain-exception.filter.spec.ts`
Expected: FAIL — cannot find module `../../../core/exceptions/product-not-purchased.exception` (none of these files exist yet).

- [ ] **Step 3: Implement**

```ts
// Micro-services/review/src/core/exceptions/domain.exception.ts
export abstract class DomainException extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
```

```ts
// Micro-services/review/src/core/exceptions/product-not-purchased.exception.ts
import { DomainException } from './domain.exception';

export class ProductNotPurchasedException extends DomainException {
  constructor() {
    super('Customer has not purchased this product in the given order');
  }
}
```

```ts
// Micro-services/review/src/core/exceptions/order-service-unavailable.exception.ts
import { DomainException } from './domain.exception';

export class OrderServiceUnavailableException extends DomainException {
  constructor() {
    super('Order service is unavailable');
  }
}
```

```ts
// Micro-services/review/src/adapters/in/filters/domain-exception.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainException } from '../../../core/exceptions/domain.exception';
import { ProductNotPurchasedException } from '../../../core/exceptions/product-not-purchased.exception';
import { OrderServiceUnavailableException } from '../../../core/exceptions/order-service-unavailable.exception';

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const httpException = this.toHttp(exception);
    response.status(httpException.getStatus()).json(httpException.getResponse());
  }

  private toHttp(exception: DomainException): HttpException {
    if (exception instanceof ProductNotPurchasedException) {
      return new ForbiddenException(exception.message);
    }
    if (exception instanceof OrderServiceUnavailableException) {
      return new ServiceUnavailableException(exception.message);
    }
    return new InternalServerErrorException();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Micro-services/review && npx jest domain-exception.filter.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd Micro-services/review
git add src/core/exceptions/domain.exception.ts src/core/exceptions/product-not-purchased.exception.ts src/core/exceptions/order-service-unavailable.exception.ts src/adapters/in/filters/domain-exception.filter.ts src/adapters/in/filters/domain-exception.filter.spec.ts
git commit -m "feat(review): add DomainException base classes and HTTP filter"
```

---

## Task 7: review-service — `IOrderClient` port + `OrderHttpClient` adapter

**Files:**
- Create: `Micro-services/review/src/core/interfaces/external/order-client.interface.ts`
- Create: `Micro-services/review/src/adapters/out/external/order-http-client.ts`
- Create: `Micro-services/review/src/adapters/out/external/order-http-client.spec.ts`
- Modify: `Micro-services/review/.env` (add `ORDER_SERVICE_URL`)

**Interfaces:**
- Consumes: `OrderServiceUnavailableException` (Task 6).
- Produces: `ORDER_CLIENT` token + `IOrderClient.verifyPurchase(accessToken: string, orderId: string, productId: string): Promise<PurchaseVerification>` where `PurchaseVerification = { eligible: true; sellerId: string } | { eligible: false }` — the exact JSON contract produced by order-service's Task 3 endpoint. Task 8 (`ReviewService`) is the consumer.

- [ ] **Step 1: Write the failing test**

```ts
// Micro-services/review/src/adapters/out/external/order-http-client.spec.ts
import { OrderHttpClient } from './order-http-client';
import { OrderServiceUnavailableException } from '../../../core/exceptions/order-service-unavailable.exception';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('OrderHttpClient.verifyPurchase', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns eligible + sellerId on a 200 response', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { eligible: true, sellerId: 'seller-1' })) as any;
    const client = new OrderHttpClient();

    const result = await client.verifyPurchase('token-1', 'order-1', 'prod-1');

    expect(result).toEqual({ eligible: true, sellerId: 'seller-1' });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3006/api/v1/orders/order-1/verify-purchase?productId=prod-1',
      { method: 'GET', headers: { Authorization: 'Bearer token-1' } },
    );
  });

  it('treats a non-2xx response (e.g. 403/404) as not eligible, without throwing', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(404, {})) as any;
    const client = new OrderHttpClient();

    const result = await client.verifyPurchase('token-1', 'order-missing', 'prod-1');

    expect(result).toEqual({ eligible: false });
  });

  it('throws OrderServiceUnavailableException on a network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;
    const client = new OrderHttpClient();

    await expect(client.verifyPurchase('token-1', 'order-1', 'prod-1')).rejects.toThrow(
      OrderServiceUnavailableException,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Micro-services/review && npx jest order-http-client.spec.ts`
Expected: FAIL — cannot find module `./order-http-client`.

- [ ] **Step 3: Implement**

```ts
// Micro-services/review/src/core/interfaces/external/order-client.interface.ts
export const ORDER_CLIENT = Symbol('ORDER_CLIENT');

export type PurchaseVerification = { eligible: true; sellerId: string } | { eligible: false };

/**
 * Port pro order-service. Único jeito do review-service saber se o customer autenticado
 * realmente comprou `productId` em `orderId` — repassa o JWT do usuário atual, mesmo padrão de
 * cart/catalog nos outros serviços.
 */
export interface IOrderClient {
  /**
   * `GET /orders/:orderId/verify-purchase?productId=`. Só uma resposta HTTP 200 conta como
   * verificação real; qualquer outro status (403/404 etc.) é tratado como `{ eligible: false }`
   * (falha fechada). Erro de rede/timeout lança `OrderServiceUnavailableException`.
   */
  verifyPurchase(accessToken: string, orderId: string, productId: string): Promise<PurchaseVerification>;
}
```

```ts
// Micro-services/review/src/adapters/out/external/order-http-client.ts
import { Injectable } from '@nestjs/common';
import { OrderServiceUnavailableException } from '../../../core/exceptions/order-service-unavailable.exception';
import { IOrderClient, PurchaseVerification } from '../../../core/interfaces/external/order-client.interface';

@Injectable()
export class OrderHttpClient implements IOrderClient {
  private readonly baseUrl = process.env.ORDER_SERVICE_URL ?? 'http://localhost:3006/api/v1';

  async verifyPurchase(accessToken: string, orderId: string, productId: string): Promise<PurchaseVerification> {
    let response: Response;
    try {
      response = await fetch(
        `${this.baseUrl}/orders/${orderId}/verify-purchase?productId=${encodeURIComponent(productId)}`,
        { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } },
      );
    } catch {
      throw new OrderServiceUnavailableException();
    }

    if (!response.ok) {
      return { eligible: false };
    }

    return (await response.json()) as PurchaseVerification;
  }
}
```

Append to `Micro-services/review/.env`:

```
ORDER_SERVICE_URL="http://localhost:3006/api/v1"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Micro-services/review && npx jest order-http-client.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd Micro-services/review
git add src/core/interfaces/external/order-client.interface.ts src/adapters/out/external/order-http-client.ts src/adapters/out/external/order-http-client.spec.ts .env
git commit -m "feat(review): add IOrderClient port to verify purchase eligibility"
```

---

## Task 8: review-service — `ReviewRequest` DTO fix + `ReviewService.sendReview` rewrite

**Files:**
- Modify: `Micro-services/review/src/adapters/in/controllers/dtos/review-request.ts`
- Modify: `Micro-services/review/src/core/interfaces/services/review-service-interface.ts`
- Modify: `Micro-services/review/src/application/services/review-service.ts`
- Modify: `Micro-services/review/src/application/services/review-service.spec.ts` (full rewrite — the existing spec's `build()` helper is missing two of the four repo methods it needs, and its assertions don't match what the service actually does; this task replaces it rather than patching around it)

**Interfaces:**
- Consumes: `IOrderClient.verifyPurchase` (Task 7), `ProductNotPurchasedException` (Task 6), `IReviewRepository.save(review: ReviewInput, sellerId: string): Promise<void>` (signature changes in Task 9 — this task updates the call site first; Task 9 implements the new repository behavior. Both tasks touch `IReviewRepository`'s declared signature, so do Task 8 before Task 9 or the interface will be inconsistent between them — that's fine, TypeScript will just show the interface temporarily unimplemented until Task 9 lands, which is expected mid-plan).
- Produces: `IReviewService.sendReview(customerId: string, accessToken: string, review: ReviewRequest): Promise<void>` (new signature — was `sendReview(review: ReviewRequest): Promise<void>`). Task 10 (`ReviewController`) is the consumer of this new signature.

**Behavioral change to be aware of:** review-service's `main.ts` runs a global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`. Once `customerId` is removed from `ReviewRequest`, any client that still sends a `customerId` field in the `POST /reviews` body will get a hard `400 Bad Request` from the pipe (not a silent strip) — `forbidNonWhitelisted` rejects unknown properties outright. That's the correct behavior (we want the field gone), but it means any existing caller/Postman collection/frontend still posting `customerId` needs to stop doing so at the same time this ships, or their requests will start failing with 400 instead of the field being silently ignored.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `Micro-services/review/src/application/services/review-service.spec.ts`:

```ts
import { ReviewService } from './review-service';
import { ProductNotPurchasedException } from '../../core/exceptions/product-not-purchased.exception';

function build() {
  const reviewRepository = {
    save: jest.fn(),
    findByProductId: jest.fn(),
    findByCustomerAndProduct: jest.fn(),
    update: jest.fn(),
  };
  const orderClient = { verifyPurchase: jest.fn() };
  const service = new ReviewService(reviewRepository as any, orderClient as any);
  return { service, reviewRepository, orderClient };
}

describe('ReviewService', () => {
  describe('sendReview', () => {
    it('throws ProductNotPurchasedException and saves nothing when not eligible', async () => {
      const { service, reviewRepository, orderClient } = build();
      orderClient.verifyPurchase.mockResolvedValue({ eligible: false });

      await expect(
        service.sendReview('customer-1', 'token-1', {
          grade: 5,
          comment: 'Great product',
          orderId: 'order-1',
          productId: 'prod-1',
        } as any),
      ).rejects.toThrow(ProductNotPurchasedException);
      expect(reviewRepository.save).not.toHaveBeenCalled();
      expect(reviewRepository.update).not.toHaveBeenCalled();
    });

    it('creates a new review (with sellerId from the eligibility check) when none exists yet for this customer+product', async () => {
      const { service, reviewRepository, orderClient } = build();
      orderClient.verifyPurchase.mockResolvedValue({ eligible: true, sellerId: 'seller-1' });
      reviewRepository.findByCustomerAndProduct.mockResolvedValue(null);

      await service.sendReview('customer-1', 'token-1', {
        grade: 5,
        comment: 'Great product',
        orderId: 'order-1',
        productId: 'prod-1',
      } as any);

      expect(orderClient.verifyPurchase).toHaveBeenCalledWith('token-1', 'order-1', 'prod-1');
      expect(reviewRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          grade: 5,
          comment: 'Great product',
          customerId: 'customer-1',
          orderId: 'order-1',
          productId: 'prod-1',
        }),
        'seller-1',
      );
      expect(reviewRepository.update).not.toHaveBeenCalled();
    });

    it('updates the existing review (no outbox event) when the customer already reviewed this product', async () => {
      const { service, reviewRepository, orderClient } = build();
      orderClient.verifyPurchase.mockResolvedValue({ eligible: true, sellerId: 'seller-1' });
      reviewRepository.findByCustomerAndProduct.mockResolvedValue({
        id: 'review-existing',
        grade: 3,
        comment: 'old comment',
        customerId: 'customer-1',
        orderId: 'order-1',
        productId: 'prod-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.sendReview('customer-1', 'token-1', {
        grade: 4,
        comment: 'updated comment',
        orderId: 'order-1',
        productId: 'prod-1',
      } as any);

      expect(reviewRepository.update).toHaveBeenCalledWith(
        'review-existing',
        expect.objectContaining({ grade: 4, comment: 'updated comment', customerId: 'customer-1' }),
      );
      expect(reviewRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('getReviewsByProductId', () => {
    it('returns the reviews for a product', async () => {
      const { service, reviewRepository } = build();
      const reviews = [{ id: '1', grade: 5, comment: 'Great product', customerId: '1', orderId: '1', productId: '1' }];
      reviewRepository.findByProductId.mockResolvedValue(reviews);

      const result = await service.getReviewsByProductId('1');

      expect(reviewRepository.findByProductId).toHaveBeenCalledWith('1');
      expect(result).toBe(reviews);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Micro-services/review && npx jest review-service.spec.ts`
Expected: FAIL — `ReviewService` constructor only accepts one argument today; `sendReview` has the old single-argument signature.

- [ ] **Step 3: Implement**

In `Micro-services/review/src/adapters/in/controllers/dtos/review-request.ts`, remove the `customerId` field entirely:

```ts
import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class ReviewRequest {
  @IsInt()
  @Min(1)
  @Max(5)
  grade: number;

  @IsString()
  @IsNotEmpty()
  comment: string;

  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsString()
  @IsNotEmpty()
  productId: string;
}
```

In `Micro-services/review/src/core/interfaces/services/review-service-interface.ts`:

```ts
import { ReviewRequest } from "src/adapters/in/controllers/dtos/review-request";
import { Review } from "src/core/entities/review-entity";

export const REVIEW_SERVICE = Symbol('REVIEW_SERVICE');
export interface IReviewService {
    sendReview(customerId: string, accessToken: string, review: ReviewRequest): Promise<void>;
    getReviewsByProductId(productId: string): Promise<Review[]>;
}
```

In `Micro-services/review/src/application/services/review-service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { ReviewRequest } from 'src/adapters/in/controllers/dtos/review-request';
import { REVIEW_REPOSITORY, type IReviewRepository } from 'src/core/interfaces/repositories/review-repository-interface';
import { ORDER_CLIENT, type IOrderClient } from 'src/core/interfaces/external/order-client.interface';
import { IReviewService } from 'src/core/interfaces/services/review-service-interface';
import { ProductNotPurchasedException } from 'src/core/exceptions/product-not-purchased.exception';
import { Review } from 'src/core/entities/review-entity';
import { randomUUID } from 'crypto';

@Injectable()
export class ReviewService implements IReviewService {

  constructor(
    @Inject(REVIEW_REPOSITORY) private readonly repo: IReviewRepository,
    @Inject(ORDER_CLIENT) private readonly orderClient: IOrderClient,
  ) { }

  async sendReview(customerId: string, accessToken: string, review: ReviewRequest): Promise<void> {
    const verification = await this.orderClient.verifyPurchase(accessToken, review.orderId, review.productId);
    if (!verification.eligible) {
      throw new ProductNotPurchasedException();
    }

    const reviewByCustomer = await this.repo.findByCustomerAndProduct(customerId, review.productId);
    const input = {
      id: randomUUID(),
      grade: review.grade,
      comment: review.comment,
      customerId,
      orderId: review.orderId,
      productId: review.productId,
    };

    if (reviewByCustomer) {
      await this.repo.update(reviewByCustomer.id, input);
    } else {
      await this.repo.save(input, verification.sellerId);
    }
  }

  async getReviewsByProductId(productId: string): Promise<Review[]> {
    return this.repo.findByProductId(productId);
  }
}
```

Also update `Micro-services/review/src/core/interfaces/repositories/review-repository-interface.ts`'s `save` signature (implementation lands in Task 9, but the interface must agree with this call site now):

```ts
import { Review } from "../../entities/review-entity";
import { ReviewInput } from "./inputs/review-input";

export const REVIEW_REPOSITORY = Symbol('REVIEW_REPOSITORY');
export interface IReviewRepository {
    save(review: ReviewInput, sellerId: string): Promise<void>;
    findByProductId(productId: string): Promise<Review[]>;
    findByCustomerAndProduct(customerId: string, productId: string): Promise<Review | null>;
    update(id: string, review: ReviewInput): Promise<void>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd Micro-services/review && npx jest review-service.spec.ts`
Expected: PASS (4 tests). Note: `npx tsc --noEmit` will still show `ReviewRepository.save` (the class, not yet updated) as not matching the new interface signature — that's expected and resolved by Task 9. Don't run a full typecheck as a gate for this task.

- [ ] **Step 5: Commit**

```bash
cd Micro-services/review
git add src/adapters/in/controllers/dtos/review-request.ts src/core/interfaces/services/review-service-interface.ts src/core/interfaces/repositories/review-repository-interface.ts src/application/services/review-service.ts src/application/services/review-service.spec.ts
git commit -m "feat(review): validate purchase eligibility before saving a review"
```

---

## Task 9: review-service — `ReviewRepository.save` becomes transactional (writes the outbox event)

**Files:**
- Modify: `Micro-services/review/src/adapters/out/repositories/review-repository.ts`
- Create: `Micro-services/review/src/adapters/out/repositories/review-repository.spec.ts` (no spec exists for this class today)

**Interfaces:**
- Consumes: `PrismaService.$transaction` (existing capability, confirmed in `review/src/adapters/out/database/prisma.service.ts`), `Prisma.InputJsonValue` (from `generated/prisma/client`, confirmed exported via `export { Prisma }` in `generated/prisma/client.ts`).
- Produces: `IReviewRepository.save(review: ReviewInput, sellerId: string): Promise<void>` — creates the `Review` row and an `OutboxEvent` row (`aggregateType: 'Review'`, `aggregateId: review.id`, `eventType: 'ReviewSent'`) in the same Prisma transaction. Task 5's `OutboxRelayService` is the consumer of the rows this writes.

- [ ] **Step 1: Write the failing test**

```ts
// Micro-services/review/src/adapters/out/repositories/review-repository.spec.ts
import { ReviewRepository } from './review-repository';

function buildTx() {
  return {
    review: { create: jest.fn(), update: jest.fn() },
    outboxEvent: { create: jest.fn() },
  };
}

function buildRepo() {
  const tx = buildTx();
  const prisma = {
    $transaction: jest.fn((cb: any) => cb(tx)),
    review: { findMany: jest.fn(), findFirst: jest.fn() },
  } as any;
  return { repo: new ReviewRepository(prisma), prisma, tx };
}

describe('ReviewRepository.save', () => {
  it('creates the Review and an OutboxEvent(ReviewSent) in the same transaction', async () => {
    const { repo, tx } = buildRepo();
    const input = {
      id: 'review-1',
      grade: 5,
      comment: 'Great product',
      customerId: 'customer-1',
      orderId: 'order-1',
      productId: 'prod-1',
    };

    await repo.save(input, 'seller-1');

    expect(tx.review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'review-1',
          grade: 5,
          comment: 'Great product',
          customerId: 'customer-1',
          orderId: 'order-1',
          productId: 'prod-1',
        }),
      }),
    );
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        aggregateType: 'Review',
        aggregateId: 'review-1',
        eventType: 'ReviewSent',
        payload: {
          reviewId: 'review-1',
          customerId: 'customer-1',
          productId: 'prod-1',
          sellerId: 'seller-1',
          grade: 5,
          comment: 'Great product',
          orderId: 'order-1',
        },
      },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Micro-services/review && npx jest review-repository.spec.ts`
Expected: FAIL — `tx.outboxEvent.create` not called (current `save` only calls `this.prisma.review.create` directly, no transaction, no outbox row).

- [ ] **Step 3: Implement**

Replace `save` in `Micro-services/review/src/adapters/out/repositories/review-repository.ts` (keep `findByProductId`, `toEntity`, `findByCustomerAndProduct`, `update` unchanged) and add the `Prisma` type import:

```ts
import { Injectable } from "@nestjs/common";
import type { Prisma, Review as PrismaReview } from "generated/prisma/client";
import { PrismaService } from "src/adapters/out/database/prisma.service";
import { Review } from "src/core/entities/review-entity";
import { ReviewInput } from "src/core/interfaces/repositories/inputs/review-input";
import type { IReviewRepository } from "src/core/interfaces/repositories/review-repository-interface";

@Injectable()
export class ReviewRepository implements IReviewRepository {
    constructor(private readonly prisma: PrismaService) { }

    async save(review: ReviewInput, sellerId: string): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            await tx.review.create({
                data: {
                    id: review.id,
                    grade: review.grade,
                    comment: review.comment,
                    customerId: review.customerId,
                    orderId: review.orderId,
                    productId: review.productId,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            });

            await tx.outboxEvent.create({
                data: {
                    aggregateType: 'Review',
                    aggregateId: review.id,
                    eventType: 'ReviewSent',
                    payload: {
                        reviewId: review.id,
                        customerId: review.customerId,
                        productId: review.productId,
                        sellerId,
                        grade: review.grade,
                        comment: review.comment,
                        orderId: review.orderId,
                    } as Prisma.InputJsonValue,
                },
            });
        });
    }

    async findByProductId(productId: string): Promise<Review[]> {
        const rows = await this.prisma.review.findMany({
            where: { productId },
            orderBy: { createdAt: 'desc' },
        });
        return rows.map((row) => this.toEntity(row));
    }

    private toEntity(row: PrismaReview): Review {
        return new Review({
            id: row.id,
            grade: row.grade,
            comment: row.comment,
            customerId: row.customerId,
            orderId: row.orderId,
            productId: row.productId,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        });
    }

    async findByCustomerAndProduct(customerId: string, productId: string): Promise<Review | null> {
        const row = await this.prisma.review.findFirst({
            where: { customerId, productId },
        });
        return row ? this.toEntity(row) : null;
    }

    async update(id: string, review: ReviewInput): Promise<void> {
        await this.prisma.review.update({
            where: { id },
            data: {
                grade: review.grade,
                comment: review.comment,
                updatedAt: new Date()
            }
        });
        return;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Micro-services/review && npx jest review-repository.spec.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Run the full review-service suite to confirm Task 8's interface change and this implementation now agree**

Run: `cd Micro-services/review && npx jest`
Expected: PASS across all spec files (including `review-service.spec.ts` from Task 8).

- [ ] **Step 6: Commit**

```bash
cd Micro-services/review
git add src/adapters/out/repositories/review-repository.ts src/adapters/out/repositories/review-repository.spec.ts
git commit -m "feat(review): write ReviewSent outbox event transactionally on review creation"
```

---

## Task 10: review-service — `ReviewController` fix (JWT-derived `customerId`)

**Files:**
- Modify: `Micro-services/review/src/adapters/in/controllers/review.controller.ts`
- Modify: `Micro-services/review/src/adapters/in/controllers/review.controller.spec.ts`

**Interfaces:**
- Consumes: `IReviewService.sendReview(customerId, accessToken, review)` (Task 8), `request.user!.sub` (populated by the existing `JwtAuthGuard`, already applied via `@UseGuards(JwtAuthGuard)` at the controller class level).
- Produces: `POST /reviews` no longer trusts a client-supplied `customerId` — it's derived from the verified JWT. This closes the authorization gap the whole purchase-validation feature depends on (without it, a customer could claim any `customerId` and the eligibility check would be checking someone else's purchase, not their own).

- [ ] **Step 1: Write the failing test**

Replace the full contents of `Micro-services/review/src/adapters/in/controllers/review.controller.spec.ts`:

```ts
import { ReviewController } from './review.controller';

function build() {
  const service = { sendReview: jest.fn(), getReviewsByProductId: jest.fn() };
  return { service, controller: new ReviewController(service as any) };
}

function requestWith(userId: string, bearer = 'token-1') {
  return {
    user: { sub: userId },
    headers: { authorization: `Bearer ${bearer}` },
  } as any;
}

describe('ReviewController', () => {
  describe('sendReview', () => {
    it('derives customerId from the JWT and forwards the bearer token to the service', async () => {
      const { controller, service } = build();
      const review = { grade: 5, comment: 'Great product', orderId: 'order-1', productId: 'prod-1' };

      await controller.sendReview(requestWith('customer-1', 'token-1'), review as any);

      expect(service.sendReview).toHaveBeenCalledWith('customer-1', 'token-1', review);
    });
  });

  describe('getByProductId', () => {
    it('returns the mapped reviews for the product', async () => {
      const { controller, service } = build();
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const updatedAt = new Date('2026-01-01T00:00:00.000Z');
      service.getReviewsByProductId.mockResolvedValue([
        { id: '1', grade: 5, comment: 'Great product', customerId: '1', orderId: '1', productId: '1', createdAt, updatedAt },
      ]);

      const result = await controller.getByProductId('1');

      expect(service.getReviewsByProductId).toHaveBeenCalledWith('1');
      expect(result).toEqual([
        { id: '1', grade: 5, comment: 'Great product', customerId: '1', orderId: '1', productId: '1', createdAt, updatedAt },
      ]);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Micro-services/review && npx jest review.controller.spec.ts`
Expected: FAIL — `service.sendReview` called with the old single-argument shape (the controller still does `this.reviewService.sendReview(review)`).

- [ ] **Step 3: Implement**

```ts
// Micro-services/review/src/adapters/in/controllers/review.controller.ts
import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ReviewRequest } from './dtos/review-request';
import type { ReviewResponseDto } from './dtos/review-response';
import type { IReviewService } from 'src/core/interfaces/services/review-service-interface';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { REVIEW_SERVICE } from 'src/core/interfaces/services/review-service-interface';
import { ReviewMapper } from 'src/application/mappers/review-mapper';

@Controller('reviews')
@UseGuards(JwtAuthGuard)
export class ReviewController {
  constructor(@Inject(REVIEW_SERVICE) private readonly reviewService: IReviewService) { }

  @Post()
  async sendReview(@Req() request: Request, @Body() review: ReviewRequest): Promise<void> {
    const accessToken = this.extractBearerToken(request);
    return this.reviewService.sendReview(request.user!.sub, accessToken, review);
  }

  @Get('product/:productId')
  async getByProductId(@Param('productId') productId: string): Promise<ReviewResponseDto[]> {
    const reviews = await this.reviewService.getReviewsByProductId(productId);
    return reviews.map((review) => ReviewMapper.toResponse(review));
  }

  private extractBearerToken(request: Request): string {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new BadRequestException('Missing bearer token');
    }
    return header.slice('Bearer '.length);
  }
}
```

Note: `request.user` requires the `Express.Request.user` augmentation — already declared in `review/src/adapters/in/express.d.ts` (confirmed identical shape to order-service's), so no type changes needed there. Also note the plain `@Req() request: Request` type comes from `express` (not `@nestjs/common`) — matching the import order-service's controllers already use; if the current file imports `Request` from elsewhere or not at all, add `import type { Request } from 'express';` as shown above.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Micro-services/review && npx jest review.controller.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd Micro-services/review
git add src/adapters/in/controllers/review.controller.ts src/adapters/in/controllers/review.controller.spec.ts
git commit -m "fix(review): derive customerId from JWT instead of trusting the request body"
```

---

## Task 11: review-service — wire everything in `review.module.ts`

**Files:**
- Modify: `Micro-services/review/src/review.module.ts`

**Interfaces:**
- Consumes: every provider/token created in Tasks 5–10 (`OUTBOX_EVENT_REPOSITORY`/`OutboxEventRepository`, `OutboxRelayService`, `ORDER_CLIENT`/`OrderHttpClient`, `DomainExceptionFilter`).
- Produces: a fully wired Nest module — this is what actually makes the new code paths reachable at runtime. No new tests (module wiring is exercised by every other test in the service failing/passing at runtime via `npm run start`; there's no existing precedent in this repo for testing `*.module.ts` files directly — `payment.module.ts`/`order.module.ts`/`notification.module.ts` have no specs either).

- [ ] **Step 1: Implement**

Replace `Micro-services/review/src/review.module.ts` in full:

```ts
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ReviewController } from './adapters/in/controllers/review.controller';
import { ReviewService } from './application/services/review-service';
import { REVIEW_REPOSITORY } from './core/interfaces/repositories/review-repository-interface';
import { ReviewRepository } from './adapters/out/repositories/review-repository';
import { REVIEW_SERVICE } from './core/interfaces/services/review-service-interface';
import { TOKEN_SERVICE } from './core/interfaces/services/token-service.interface';
import { TokenService } from './application/services/token.service';
import { JwtAuthGuard } from './adapters/in/controllers/guards/jwt-auth.guard';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtModule } from '@nestjs/jwt';
import { EVENT_PUBLISHER } from './core/interfaces/external/event-publisher.interface';
import { KafkaEventPublisher } from './adapters/out/external/kafka-event-publisher';
import { ORDER_CLIENT } from './core/interfaces/external/order-client.interface';
import { OrderHttpClient } from './adapters/out/external/order-http-client';
import { OUTBOX_EVENT_REPOSITORY } from './core/interfaces/repositories/outbox-event-repository.interface';
import { OutboxEventRepository } from './adapters/out/repositories/outbox-event.repository';
import { OutboxRelayService } from './application/services/outbox-relay.service';
import { DomainExceptionFilter } from './adapters/in/filters/domain-exception.filter';

@Module({
  imports: [ScheduleModule.forRoot(), JwtModule.register({})],
  controllers: [ReviewController],
  providers: [
    { provide: REVIEW_REPOSITORY, useClass: ReviewRepository },
    { provide: REVIEW_SERVICE, useClass: ReviewService },
    { provide: TOKEN_SERVICE, useClass: TokenService },
    { provide: EVENT_PUBLISHER, useClass: KafkaEventPublisher },
    { provide: ORDER_CLIENT, useClass: OrderHttpClient },
    { provide: OUTBOX_EVENT_REPOSITORY, useClass: OutboxEventRepository },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    OutboxRelayService,
    JwtAuthGuard,
  ],
})
export class ReviewModule { }
```

- [ ] **Step 2: Run the full test suite**

Run: `cd Micro-services/review && npx jest`
Expected: PASS across every spec file in the service.

- [ ] **Step 3: Verify the app boots**

Run: `cd Micro-services/review && npm run build && node dist/main.js &` then check it logs a successful Nest bootstrap (no `UnknownDependenciesException` — that specific error means a token above is missing from `providers`). Kill the process afterward (`kill %1` or `pkill -f dist/main.js`).
Expected: no dependency-injection errors on boot. (It's fine if it can't fully connect to Kafka/DB in your local environment — DI wiring errors happen synchronously at module init, before any network call, so they'll surface immediately regardless.)

- [ ] **Step 4: Commit**

```bash
cd Micro-services/review
git add src/review.module.ts
git commit -m "feat(review): wire outbox relay, order client and domain exception filter"
```

---

## Task 12: notification-service — `SellerProfile` read-model

**Files:**
- Modify: `Micro-services/notification/prisma/schema.prisma`
- Create: `Micro-services/notification/prisma/migrations/*` (generated)
- Create: `Micro-services/notification/src/core/entities/seller-profile.entity.ts`
- Create: `Micro-services/notification/src/core/interfaces/repositories/seller-profile-repository.interface.ts`
- Create: `Micro-services/notification/src/core/interfaces/repositories/inputs/seller-profile-repository.inputs.ts`
- Create: `Micro-services/notification/src/adapters/out/repositories/seller-profile.repository.ts`
- Create: `Micro-services/notification/src/adapters/out/repositories/seller-profile.repository.spec.ts`

**Interfaces:**
- Consumes: `PrismaService.$transaction` (existing), `ProcessedEvent` model (existing inbox-dedupe table, same one `UserContactRepository.upsertWithInbox` already uses).
- Produces: `SELLER_PROFILE_REPOSITORY` token + `ISellerProfileRepository { findBySellerId(sellerId): Promise<SellerProfile | null>; upsertWithInbox(eventId, eventType, input): Promise<boolean>; }`. Task 13 (`CatalogEventsConsumer`/`handleSellerOnboarded`) writes to this; Task 14 (`handleReviewSent`) reads from it.

This mirrors payment-service's `SellerPaymentProfile` (`payment/src/core/entities/seller-payment-profile.entity.ts` and siblings) and notification's own existing `UserContactRepository` (`notification/src/adapters/out/repositories/user-contact.repository.ts`) — same upsert-with-inbox shape, just a different read-model (`sellerId -> userId` instead of `userId -> {email, name}`).

- [ ] **Step 1: Add the Prisma model and migrate**

Edit `Micro-services/notification/prisma/schema.prisma`, adding after the `UserContact` model:

```prisma
// Read-model local, alimentado por `SellerOnboarded` (catalog-events). Necessário porque o catalog
// não expõe `Seller.userId` publicamente (mesmo raciocínio do SellerPaymentProfile do
// payment-service) — é o único jeito do notification-service resolver sellerId -> userId pra
// enviar o e-mail de ReviewSent pro seller certo.
model SellerProfile {
  sellerId  String   @id
  userId    String
  updatedAt DateTime @updatedAt
}
```

Also add `REVIEW_RECEIVED` to the `NotificationType` enum (needed by Task 14's `handleReviewSent`, adding it now keeps this migration the single place schema changes happen for this feature in notification-db):

```prisma
enum NotificationType {
  ORDER_CREATED
  PAYMENT_CONFIRMED
  PAYMENT_FAILED
  PAYMENT_REFUNDED
  SHIPMENT_DISPATCHED
  SHIPMENT_DELIVERED
  ORDER_CANCELLED
  REVIEW_RECEIVED
}
```

Run: `cd Micro-services/notification && npx prisma migrate dev --name add_seller_profile_and_review_notification`
Expected: creates a new migration folder under `prisma/migrations/` with `CREATE TABLE "SellerProfile"` and `ALTER TYPE "NotificationType" ADD VALUE 'REVIEW_RECEIVED'`, applies it against the docker-compose `notification_db` (make sure that container is running first: `docker compose ps notification-db` from the repo root, or wherever the compose file lives — start it with `docker compose up -d notification-db` if not).

> Note: the schema's existing comment on `UserContact` documents that an earlier session added that model without ever running a real migration (schema edited + `prisma generate` only). This task's migration also happens to be the first *real* migration since then for this model — if `prisma migrate dev` reports drift because `UserContact` was never actually migrated, let it fold `UserContact`'s table creation into this same migration (that's fixing a pre-existing gap as a side effect, not scope creep — you can't add `SellerProfile` via `migrate dev` while the schema is drifted from the migration history without resolving that first).

- [ ] **Step 2: Write the failing test for the repository**

```ts
// Micro-services/notification/src/adapters/out/repositories/seller-profile.repository.spec.ts
import { SellerProfileRepository } from './seller-profile.repository';

function buildTx() {
  return {
    processedEvent: { findUnique: jest.fn(), create: jest.fn() },
    sellerProfile: { upsert: jest.fn(), findUnique: jest.fn() },
  };
}

function buildRepo() {
  const tx = buildTx();
  const prisma = {
    $transaction: jest.fn((cb: any) => cb(tx)),
    sellerProfile: { findUnique: jest.fn() },
  } as any;
  return { repo: new SellerProfileRepository(prisma), prisma, tx };
}

describe('SellerProfileRepository', () => {
  describe('findBySellerId', () => {
    it('returns null when no profile exists', async () => {
      const { repo, prisma } = buildRepo();
      prisma.sellerProfile.findUnique.mockResolvedValue(null);

      await expect(repo.findBySellerId('seller-1')).resolves.toBeNull();
    });

    it('returns the SellerProfile when found', async () => {
      const { repo, prisma } = buildRepo();
      prisma.sellerProfile.findUnique.mockResolvedValue({ sellerId: 'seller-1', userId: 'user-1' });

      const result = await repo.findBySellerId('seller-1');

      expect(result).toEqual({ sellerId: 'seller-1', userId: 'user-1' });
    });
  });

  describe('upsertWithInbox', () => {
    it('no-ops when the eventId was already processed', async () => {
      const { repo, tx } = buildRepo();
      tx.processedEvent.findUnique.mockResolvedValue({ id: 'p', eventId: 'evt-1' });

      const result = await repo.upsertWithInbox('evt-1', 'SellerOnboarded', { sellerId: 'seller-1', userId: 'user-1' });

      expect(result).toBe(false);
      expect(tx.sellerProfile.upsert).not.toHaveBeenCalled();
    });

    it('upserts the profile and records the inbox entry when fresh', async () => {
      const { repo, tx } = buildRepo();
      tx.processedEvent.findUnique.mockResolvedValue(null);

      const result = await repo.upsertWithInbox('evt-1', 'SellerOnboarded', { sellerId: 'seller-1', userId: 'user-1' });

      expect(result).toBe(true);
      expect(tx.sellerProfile.upsert).toHaveBeenCalledWith({
        where: { sellerId: 'seller-1' },
        create: { sellerId: 'seller-1', userId: 'user-1' },
        update: { userId: 'user-1' },
      });
      expect(tx.processedEvent.create).toHaveBeenCalledWith({
        data: { eventId: 'evt-1', eventType: 'SellerOnboarded' },
      });
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd Micro-services/notification && npx jest seller-profile.repository.spec.ts`
Expected: FAIL — cannot find module `./seller-profile.repository`.

- [ ] **Step 4: Implement**

```ts
// Micro-services/notification/src/core/entities/seller-profile.entity.ts
export interface SellerProfileProps {
  sellerId: string;
  userId: string;
}

export class SellerProfile {
  readonly sellerId: string;
  readonly userId: string;

  constructor(props: SellerProfileProps) {
    this.sellerId = props.sellerId;
    this.userId = props.userId;
  }
}
```

```ts
// Micro-services/notification/src/core/interfaces/repositories/inputs/seller-profile-repository.inputs.ts
// Forma de escrita do read-model SellerProfile (upsert idempotente via inbox, alimentado por
// SellerOnboarded).
export interface UpsertSellerProfileInput {
  sellerId: string;
  userId: string;
}
```

```ts
// Micro-services/notification/src/core/interfaces/repositories/seller-profile-repository.interface.ts
import { SellerProfile } from '../../entities/seller-profile.entity';
import { UpsertSellerProfileInput } from './inputs/seller-profile-repository.inputs';

export const SELLER_PROFILE_REPOSITORY = Symbol('SELLER_PROFILE_REPOSITORY');

export interface ISellerProfileRepository {
  findBySellerId(sellerId: string): Promise<SellerProfile | null>;

  // Idempotente via inbox: dedupe-check de `eventId` (ProcessedEvent) + upsert do profile, tudo
  // na mesma transação. Retorna `false` se o eventId já tinha sido processado (no-op).
  upsertWithInbox(eventId: string, eventType: string, input: UpsertSellerProfileInput): Promise<boolean>;
}
```

```ts
// Micro-services/notification/src/adapters/out/repositories/seller-profile.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SellerProfile } from '../../../core/entities/seller-profile.entity';
import { ISellerProfileRepository } from '../../../core/interfaces/repositories/seller-profile-repository.interface';
import { UpsertSellerProfileInput } from '../../../core/interfaces/repositories/inputs/seller-profile-repository.inputs';

@Injectable()
export class SellerProfileRepository implements ISellerProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBySellerId(sellerId: string): Promise<SellerProfile | null> {
    const row = await this.prisma.sellerProfile.findUnique({ where: { sellerId } });
    return row ? new SellerProfile({ sellerId: row.sellerId, userId: row.userId }) : null;
  }

  async upsertWithInbox(
    eventId: string,
    eventType: string,
    input: UpsertSellerProfileInput,
  ): Promise<boolean> {
    let processedNow = false;

    await this.prisma.$transaction(async (tx) => {
      if (await tx.processedEvent.findUnique({ where: { eventId } })) return;

      await tx.sellerProfile.upsert({
        where: { sellerId: input.sellerId },
        create: { sellerId: input.sellerId, userId: input.userId },
        update: { userId: input.userId },
      });

      await tx.processedEvent.create({ data: { eventId, eventType } });
      processedNow = true;
    });

    return processedNow;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd Micro-services/notification && npx jest seller-profile.repository.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
cd Micro-services/notification
git add prisma/schema.prisma prisma/migrations src/core/entities/seller-profile.entity.ts src/core/interfaces/repositories/seller-profile-repository.interface.ts src/core/interfaces/repositories/inputs/seller-profile-repository.inputs.ts src/adapters/out/repositories/seller-profile.repository.ts src/adapters/out/repositories/seller-profile.repository.spec.ts
git commit -m "feat(notification): add SellerProfile read-model (sellerId -> userId)"
```

---

## Task 13: notification-service — `catalog-events` consumer (`SellerOnboarded`)

**Files:**
- Modify: `Micro-services/notification/src/core/interfaces/services/notification-event.service.interface.ts`
- Modify: `Micro-services/notification/src/application/services/notification-event.service.ts`
- Modify: `Micro-services/notification/src/application/services/notification-event.service.spec.ts`
- Create: `Micro-services/notification/src/adapters/in/messaging/catalog-events.consumer.ts`
- Create: `Micro-services/notification/src/adapters/in/messaging/catalog-events.consumer.spec.ts`

**Interfaces:**
- Consumes: `ISellerProfileRepository.upsertWithInbox` (Task 12), `KafkaConsumerService.registerHandler` (existing), `parseEnvelope` (existing).
- Produces: `INotificationEventService.handleSellerOnboarded(eventId, payload: SellerOnboardedPayload): Promise<void>` and the `CatalogEventsConsumer` class subscribing to `catalog-events`. Notification-service didn't consume this topic before — this is the first consumer of it in this service.

- [ ] **Step 1: Write the failing tests**

First, **read** `Micro-services/notification/src/application/services/notification-event.service.spec.ts` in full before editing it — it already has ~200 lines of tests across several `describe` blocks (`handleUserRegistered`, `dispatch (shared by every notifiable event)`, `event type -> NotificationType/subject mapping`), all built on a single `buildService()` helper at the top of the file:

```ts
function buildService() {
  const userContactRepository = { findByUserId: jest.fn(), upsertWithInbox: jest.fn() } as any;
  const notificationRepository = {
    createPendingWithInbox: jest.fn(),
    markSent: jest.fn(),
    markFailed: jest.fn(),
  } as any;
  const emailSender = { send: jest.fn() } as any;
  const service = new NotificationEventService(userContactRepository, notificationRepository, emailSender);
  return { service, userContactRepository, notificationRepository, emailSender };
}
```

Update this exact helper (the name is `buildService`, not `build`) to add the 4th constructor argument, keeping every existing return field:

```ts
function buildService() {
  const userContactRepository = { findByUserId: jest.fn(), upsertWithInbox: jest.fn() } as any;
  const notificationRepository = {
    createPendingWithInbox: jest.fn(),
    markSent: jest.fn(),
    markFailed: jest.fn(),
  } as any;
  const emailSender = { send: jest.fn() } as any;
  const sellerProfileRepository = { findBySellerId: jest.fn(), upsertWithInbox: jest.fn() } as any;
  const service = new NotificationEventService(
    userContactRepository,
    notificationRepository,
    emailSender,
    sellerProfileRepository,
  );
  return { service, userContactRepository, notificationRepository, emailSender, sellerProfileRepository };
}
```

This is a breaking change to every existing test in the file (they all call `buildService()`), but since every existing test destructures only the fields it uses, adding a 5th return field and a 4th constructor arg does not require touching any of the ~10 existing `it(...)` blocks — only this one function.

Then add a new `describe` block, anywhere after `buildService`'s definition:

```ts
  describe('handleSellerOnboarded', () => {
    it('upserts the SellerProfile read-model with dedupe via inbox', async () => {
      const { service, sellerProfileRepository } = buildService();

      await service.handleSellerOnboarded('evt-1', {
        sellerId: 'seller-1',
        userId: 'user-1',
        storeName: 'Loja X',
        document: '123',
        mpCollectorId: 'mp-1',
      });

      expect(sellerProfileRepository.upsertWithInbox).toHaveBeenCalledWith('evt-1', 'SellerOnboarded', {
        sellerId: 'seller-1',
        userId: 'user-1',
      });
    });
  });
```

Create `Micro-services/notification/src/adapters/in/messaging/catalog-events.consumer.spec.ts`:

```ts
import { CatalogEventsConsumer } from './catalog-events.consumer';

function buildConsumer() {
  const kafkaConsumer = { registerHandler: jest.fn() } as any;
  const eventService = { handleSellerOnboarded: jest.fn() } as any;
  const consumer = new CatalogEventsConsumer(kafkaConsumer, eventService);
  return { consumer, kafkaConsumer, eventService };
}

function envelopeMessage(envelope: unknown) {
  return { topic: 'catalog-events', message: { value: Buffer.from(JSON.stringify(envelope)) } } as any;
}

describe('CatalogEventsConsumer', () => {
  it('registers its handler on the catalog-events topic during onModuleInit', async () => {
    const { consumer, kafkaConsumer } = buildConsumer();

    await consumer.onModuleInit();

    expect(kafkaConsumer.registerHandler).toHaveBeenCalledWith('catalog-events', expect.any(Function));
  });

  it('routes SellerOnboarded to handleSellerOnboarded', async () => {
    const { consumer, eventService } = buildConsumer();
    const payload = { sellerId: 'seller-1', userId: 'user-1', storeName: 'Loja X', document: '123', mpCollectorId: 'mp-1' };

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-1',
        eventType: 'SellerOnboarded',
        aggregateType: 'Seller',
        aggregateId: 'seller-1',
        occurredAt: '2026-07-22T10:00:00.000Z',
        version: 1,
        payload,
      }),
    );

    expect(eventService.handleSellerOnboarded).toHaveBeenCalledWith('evt-1', payload);
  });

  it('silently ignores an unknown eventType', async () => {
    const { consumer, eventService } = buildConsumer();

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-2',
        eventType: 'ProductCreated',
        aggregateType: 'Product',
        aggregateId: 'prod-1',
        occurredAt: '2026-07-22T10:00:00.000Z',
        version: 1,
        payload: {},
      }),
    );

    expect(eventService.handleSellerOnboarded).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Micro-services/notification && npx jest catalog-events.consumer.spec.ts notification-event.service.spec.ts`
Expected: FAIL — `CatalogEventsConsumer` module doesn't exist; `service.handleSellerOnboarded` isn't a function.

- [ ] **Step 3: Implement**

In `Micro-services/notification/src/core/interfaces/services/notification-event.service.interface.ts`, add the payload type and method:

```ts
export interface SellerOnboardedPayload {
  sellerId: string;
  userId: string;
  storeName: string;
  document: string;
  mpCollectorId: string;
}
```

```ts
export interface INotificationEventService {
  handleUserRegistered(eventId: string, payload: UserRegisteredPayload): Promise<void>;
  handleOrderCreated(eventId: string, payload: OrderCreatedPayload): Promise<void>;
  handleOrderCancelled(eventId: string, payload: OrderCancelledPayload): Promise<void>;
  handlePaymentConfirmed(eventId: string, payload: PaymentConfirmedPayload): Promise<void>;
  handlePaymentFailed(eventId: string, payload: PaymentFailedPayload): Promise<void>;
  handlePaymentRefunded(eventId: string, payload: PaymentRefundedPayload): Promise<void>;
  handleShipmentDispatched(eventId: string, payload: ShipmentDispatchedPayload): Promise<void>;
  handleShipmentDelivered(eventId: string, payload: ShipmentDeliveredPayload): Promise<void>;
  handleSellerOnboarded(eventId: string, payload: SellerOnboardedPayload): Promise<void>;
}
```

In `Micro-services/notification/src/application/services/notification-event.service.ts`, add the `SELLER_PROFILE_REPOSITORY` dependency and the handler:

```ts
import { SELLER_PROFILE_REPOSITORY } from '../../core/interfaces/repositories/seller-profile-repository.interface';
import type { ISellerProfileRepository } from '../../core/interfaces/repositories/seller-profile-repository.interface';
import { SellerOnboardedPayload } from '../../core/interfaces/services/notification-event.service.interface';
```

```ts
  constructor(
    @Inject(USER_CONTACT_REPOSITORY) private readonly userContactRepository: IUserContactRepository,
    @Inject(NOTIFICATION_REPOSITORY) private readonly notificationRepository: INotificationRepository,
    @Inject(EMAIL_SENDER) private readonly emailSender: IEmailSender,
    @Inject(SELLER_PROFILE_REPOSITORY) private readonly sellerProfileRepository: ISellerProfileRepository,
  ) {}
```

```ts
  async handleSellerOnboarded(eventId: string, payload: SellerOnboardedPayload): Promise<void> {
    await this.sellerProfileRepository.upsertWithInbox(eventId, 'SellerOnboarded', {
      sellerId: payload.sellerId,
      userId: payload.userId,
    });
  }
```

Create `Micro-services/notification/src/adapters/in/messaging/catalog-events.consumer.ts`:

```ts
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KafkaConsumerService } from '../../out/messaging/kafka-consumer.service';
import { NOTIFICATION_EVENT_SERVICE } from '../../../core/interfaces/services/notification-event.service.interface';
import type {
  INotificationEventService,
  SellerOnboardedPayload,
} from '../../../core/interfaces/services/notification-event.service.interface';
import { parseEnvelope } from './parse-envelope';

const TOPIC = 'catalog-events';

// Consome `catalog-events`: só `SellerOnboarded` interessa ao notification-service (alimenta o
// read-model SellerProfile, usado pra resolver o e-mail do seller no consumo de ReviewSent).
@Injectable()
export class CatalogEventsConsumer implements OnModuleInit {
  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    @Inject(NOTIFICATION_EVENT_SERVICE) private readonly eventService: INotificationEventService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.kafkaConsumer.registerHandler(TOPIC, (message) => this.handle(message));
  }

  async handle(message: KafkaJS.EachMessagePayload): Promise<void> {
    const envelope = parseEnvelope<SellerOnboardedPayload>(message);
    if (!envelope) return;

    switch (envelope.eventType) {
      case 'SellerOnboarded':
        await this.eventService.handleSellerOnboarded(envelope.eventId, envelope.payload);
        return;
      default:
        return;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd Micro-services/notification && npx jest catalog-events.consumer.spec.ts notification-event.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd Micro-services/notification
git add src/core/interfaces/services/notification-event.service.interface.ts src/application/services/notification-event.service.ts src/application/services/notification-event.service.spec.ts src/adapters/in/messaging/catalog-events.consumer.ts src/adapters/in/messaging/catalog-events.consumer.spec.ts
git commit -m "feat(notification): consume SellerOnboarded to populate SellerProfile"
```

---

## Task 14: notification-service — `handleReviewSent` (the seller email)

**Files:**
- Modify: `Micro-services/notification/src/core/interfaces/services/notification-event.service.interface.ts`
- Modify: `Micro-services/notification/src/application/services/notification-event.service.ts`
- Modify: `Micro-services/notification/src/application/services/notification-event.service.spec.ts`

**Interfaces:**
- Consumes: `ISellerProfileRepository.findBySellerId` (Task 12), `IUserContactRepository.findByUserId` (existing), `INotificationRepository.createPendingWithInbox`/`markSent`/`markFailed` (existing), `IEmailSender.send` (existing), `'REVIEW_RECEIVED'` as a valid `NotificationType` (added to the Prisma enum in Task 12's migration — also needs adding to the TS union type `NotificationType` in `notification/src/core/entities/notification.entity.ts`).
- Produces: `INotificationEventService.handleReviewSent(eventId, payload: ReviewSentPayload): Promise<void>`. Task 15's `ReviewEventsConsumer` is the consumer of this method.

This does **not** reuse the existing `dispatch()` private helper — `dispatch()` assumes the event payload's `userId` directly identifies the recipient (true for every existing event type), but here the recipient (the seller) has to be resolved through `SellerProfile` first, and there's a second, best-effort lookup (the customer's name, for the email body) that no existing event type needs. It's a new private method with its own shape, following the same idempotency/error-handling conventions as `dispatch()`.

- [ ] **Step 1: Write the failing tests**

First, add `REVIEW_RECEIVED` to the `NotificationType` union in `Micro-services/notification/src/core/entities/notification.entity.ts`:

```ts
export type NotificationType =
  | 'ORDER_CREATED'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_REFUNDED'
  | 'SHIPMENT_DISPATCHED'
  | 'SHIPMENT_DELIVERED'
  | 'ORDER_CANCELLED'
  | 'REVIEW_RECEIVED';
```

Add to `Micro-services/notification/src/application/services/notification-event.service.spec.ts`:

```ts
  describe('handleReviewSent', () => {
    const payload = {
      reviewId: 'review-1',
      customerId: 'customer-1',
      productId: 'prod-1',
      sellerId: 'seller-1',
      grade: 5,
      comment: 'Ótimo produto!',
      orderId: 'order-1',
    };

    it('logs and gives up without throwing when no SellerProfile is found for sellerId', async () => {
      const { service, sellerProfileRepository, notificationRepository, emailSender } = buildService();
      sellerProfileRepository.findBySellerId.mockResolvedValue(null);

      await service.handleReviewSent('evt-1', payload);

      expect(notificationRepository.createPendingWithInbox).not.toHaveBeenCalled();
      expect(emailSender.send).not.toHaveBeenCalled();
    });

    it('throws UserContactNotFoundException when the seller has no UserContact yet', async () => {
      const { service, sellerProfileRepository, userContactRepository } = buildService();
      sellerProfileRepository.findBySellerId.mockResolvedValue({ sellerId: 'seller-1', userId: 'seller-user-1' });
      userContactRepository.findByUserId.mockResolvedValue(null);

      await expect(service.handleReviewSent('evt-1', payload)).rejects.toThrow(UserContactNotFoundException);
    });

    it('emails the seller with the customer name, grade and comment when everything resolves', async () => {
      const { service, sellerProfileRepository, userContactRepository, notificationRepository, emailSender } = buildService();
      sellerProfileRepository.findBySellerId.mockResolvedValue({ sellerId: 'seller-1', userId: 'seller-user-1' });
      userContactRepository.findByUserId.mockImplementation(async (userId: string) => {
        if (userId === 'seller-user-1') return { userId, email: 'seller@example.com', name: 'Seller Store' };
        if (userId === 'customer-1') return { userId, email: 'customer@example.com', name: 'Ana' };
        return null;
      });
      notificationRepository.createPendingWithInbox.mockResolvedValue({
        id: 'notif-1',
        recipientEmail: 'seller@example.com',
        subject: 'Nova avaliação recebida',
      });

      await service.handleReviewSent('evt-1', payload);

      expect(notificationRepository.createPendingWithInbox).toHaveBeenCalledWith('evt-1', 'ReviewSent', {
        userId: 'seller-user-1',
        type: 'REVIEW_RECEIVED',
        recipientEmail: 'seller@example.com',
        subject: 'Nova avaliação recebida',
      });
      expect(emailSender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'seller@example.com',
          subject: 'Nova avaliação recebida',
          body: expect.stringContaining('Ana'),
        }),
      );
      expect(emailSender.send.mock.calls[0][0].body).toContain('5');
      expect(emailSender.send.mock.calls[0][0].body).toContain('Ótimo produto!');
      expect(notificationRepository.markSent).toHaveBeenCalledWith('notif-1', expect.any(Date));
    });

    it('falls back to a generic customer label when the customer has no UserContact', async () => {
      const { service, sellerProfileRepository, userContactRepository, notificationRepository, emailSender } = buildService();
      sellerProfileRepository.findBySellerId.mockResolvedValue({ sellerId: 'seller-1', userId: 'seller-user-1' });
      userContactRepository.findByUserId.mockImplementation(async (userId: string) => {
        if (userId === 'seller-user-1') return { userId, email: 'seller@example.com', name: 'Seller Store' };
        return null;
      });
      notificationRepository.createPendingWithInbox.mockResolvedValue({
        id: 'notif-1',
        recipientEmail: 'seller@example.com',
        subject: 'Nova avaliação recebida',
      });

      await service.handleReviewSent('evt-1', payload);

      expect(emailSender.send.mock.calls[0][0].body).toContain('Um cliente');
    });
  });
```

The file already imports `UserContactNotFoundException` at the top (used by the existing `dispatch` tests from Task 13's Step 1 changes) — no new import needed for that. `buildService()` was already updated in Task 13 to construct `notificationRepository` with `createPendingWithInbox: jest.fn()`, which this task's tests reuse as-is.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Micro-services/notification && npx jest notification-event.service.spec.ts`
Expected: FAIL — `service.handleReviewSent is not a function`.

- [ ] **Step 3: Implement**

In `Micro-services/notification/src/core/interfaces/services/notification-event.service.interface.ts`, add:

```ts
export interface ReviewSentPayload {
  reviewId: string;
  customerId: string;
  productId: string;
  sellerId: string;
  grade: number;
  comment: string;
  orderId: string;
}
```

```ts
export interface INotificationEventService {
  // ... existing methods ...
  handleSellerOnboarded(eventId: string, payload: SellerOnboardedPayload): Promise<void>;
  handleReviewSent(eventId: string, payload: ReviewSentPayload): Promise<void>;
}
```

In `Micro-services/notification/src/application/services/notification-event.service.ts`, add the import and method:

```ts
import { ReviewSentPayload } from '../../core/interfaces/services/notification-event.service.interface';
```

```ts
  async handleReviewSent(eventId: string, payload: ReviewSentPayload): Promise<void> {
    const sellerProfile = await this.sellerProfileRepository.findBySellerId(payload.sellerId);
    if (!sellerProfile) {
      this.logger.warn(
        `SellerProfile not found for sellerId ${payload.sellerId}, dropping ReviewSent ${eventId}`,
      );
      return;
    }

    const sellerContact = await this.userContactRepository.findByUserId(sellerProfile.userId);
    if (!sellerContact) {
      throw new UserContactNotFoundException(sellerProfile.userId);
    }

    const customerContact = await this.userContactRepository.findByUserId(payload.customerId);
    const customerName = customerContact?.name ?? 'Um cliente';

    const subject = 'Nova avaliação recebida';
    const notification = await this.notificationRepository.createPendingWithInbox(eventId, 'ReviewSent', {
      userId: sellerProfile.userId,
      type: 'REVIEW_RECEIVED',
      recipientEmail: sellerContact.email,
      subject,
    });
    if (!notification) return;

    try {
      await this.emailSender.send({
        to: notification.recipientEmail,
        subject: notification.subject,
        body: `Olá ${sellerContact.name}, ${customerName} avaliou seu produto com nota ${payload.grade}/5: "${payload.comment}"`,
      });
      await this.notificationRepository.markSent(notification.id, new Date());
    } catch (error) {
      this.logger.error(`Failed to send notification ${notification.id}`, error as Error);
      await this.notificationRepository.markFailed(notification.id);
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd Micro-services/notification && npx jest notification-event.service.spec.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Commit**

```bash
cd Micro-services/notification
git add src/core/entities/notification.entity.ts src/core/interfaces/services/notification-event.service.interface.ts src/application/services/notification-event.service.ts src/application/services/notification-event.service.spec.ts
git commit -m "feat(notification): email the seller when a ReviewSent event arrives"
```

---

## Task 15: notification-service — `review-events` consumer

**Files:**
- Create: `Micro-services/notification/src/adapters/in/messaging/review-events.consumer.ts`
- Create: `Micro-services/notification/src/adapters/in/messaging/review-events.consumer.spec.ts`

**Interfaces:**
- Consumes: `INotificationEventService.handleReviewSent` (Task 14), `KafkaConsumerService.registerHandler` (existing), `parseEnvelope` (existing).
- Produces: subscribes to the `review-events` topic and routes `ReviewSent` to `handleReviewSent`. Task 16 registers this as a provider in `notification.module.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// Micro-services/notification/src/adapters/in/messaging/review-events.consumer.spec.ts
import { ReviewEventsConsumer } from './review-events.consumer';

function buildConsumer() {
  const kafkaConsumer = { registerHandler: jest.fn() } as any;
  const eventService = { handleReviewSent: jest.fn() } as any;
  const consumer = new ReviewEventsConsumer(kafkaConsumer, eventService);
  return { consumer, kafkaConsumer, eventService };
}

function envelopeMessage(envelope: unknown) {
  return { topic: 'review-events', message: { value: Buffer.from(JSON.stringify(envelope)) } } as any;
}

describe('ReviewEventsConsumer', () => {
  it('registers its handler on the review-events topic during onModuleInit', async () => {
    const { consumer, kafkaConsumer } = buildConsumer();

    await consumer.onModuleInit();

    expect(kafkaConsumer.registerHandler).toHaveBeenCalledWith('review-events', expect.any(Function));
  });

  it('routes ReviewSent to handleReviewSent', async () => {
    const { consumer, eventService } = buildConsumer();
    const payload = {
      reviewId: 'review-1',
      customerId: 'customer-1',
      productId: 'prod-1',
      sellerId: 'seller-1',
      grade: 5,
      comment: 'Ótimo!',
      orderId: 'order-1',
    };

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-1',
        eventType: 'ReviewSent',
        aggregateType: 'Review',
        aggregateId: 'review-1',
        occurredAt: '2026-07-22T10:00:00.000Z',
        version: 1,
        payload,
      }),
    );

    expect(eventService.handleReviewSent).toHaveBeenCalledWith('evt-1', payload);
  });

  it('silently ignores an unknown eventType', async () => {
    const { consumer, eventService } = buildConsumer();

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-2',
        eventType: 'SomethingElse',
        aggregateType: 'Review',
        aggregateId: 'review-1',
        occurredAt: '2026-07-22T10:00:00.000Z',
        version: 1,
        payload: {},
      }),
    );

    expect(eventService.handleReviewSent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Micro-services/notification && npx jest review-events.consumer.spec.ts`
Expected: FAIL — cannot find module `./review-events.consumer`.

- [ ] **Step 3: Implement**

```ts
// Micro-services/notification/src/adapters/in/messaging/review-events.consumer.ts
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KafkaConsumerService } from '../../out/messaging/kafka-consumer.service';
import { NOTIFICATION_EVENT_SERVICE } from '../../../core/interfaces/services/notification-event.service.interface';
import type {
  INotificationEventService,
  ReviewSentPayload,
} from '../../../core/interfaces/services/notification-event.service.interface';
import { parseEnvelope } from './parse-envelope';

const TOPIC = 'review-events';

// Consome `review-events`: `ReviewSent` dispara o e-mail pro seller (nome do customer, nota,
// comentário). Não há outros eventTypes nesse tópico hoje.
@Injectable()
export class ReviewEventsConsumer implements OnModuleInit {
  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    @Inject(NOTIFICATION_EVENT_SERVICE) private readonly eventService: INotificationEventService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.kafkaConsumer.registerHandler(TOPIC, (message) => this.handle(message));
  }

  async handle(message: KafkaJS.EachMessagePayload): Promise<void> {
    const envelope = parseEnvelope<ReviewSentPayload>(message);
    if (!envelope) return;

    switch (envelope.eventType) {
      case 'ReviewSent':
        await this.eventService.handleReviewSent(envelope.eventId, envelope.payload);
        return;
      default:
        return;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Micro-services/notification && npx jest review-events.consumer.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd Micro-services/notification
git add src/adapters/in/messaging/review-events.consumer.ts src/adapters/in/messaging/review-events.consumer.spec.ts
git commit -m "feat(notification): consume ReviewSent and route it to the email handler"
```

---

## Task 16: notification-service — wire everything in `notification.module.ts`

**Files:**
- Modify: `Micro-services/notification/src/notification.module.ts`

**Interfaces:**
- Consumes: `SELLER_PROFILE_REPOSITORY`/`SellerProfileRepository` (Task 12), `CatalogEventsConsumer` (Task 13), `ReviewEventsConsumer` (Task 15).
- Produces: a fully wired Nest module.

- [ ] **Step 1: Implement**

Modify `Micro-services/notification/src/notification.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsController } from './adapters/in/controllers/notifications.controller';
import { JwtAuthGuard } from './adapters/in/controllers/guards/jwt-auth.guard';
import { DomainExceptionFilter } from './adapters/in/filters/domain-exception.filter';
import { AuthEventsConsumer } from './adapters/in/messaging/auth-events.consumer';
import { OrderEventsConsumer } from './adapters/in/messaging/order-events.consumer';
import { PaymentEventsConsumer } from './adapters/in/messaging/payment-events.consumer';
import { ShippingEventsConsumer } from './adapters/in/messaging/shipping-events.consumer';
import { CatalogEventsConsumer } from './adapters/in/messaging/catalog-events.consumer';
import { ReviewEventsConsumer } from './adapters/in/messaging/review-events.consumer';
import { NotificationEventService } from './application/services/notification-event.service';
import { NotificationQueryService } from './application/services/notification-query.service';
import { UserContactRepository } from './adapters/out/repositories/user-contact.repository';
import { NotificationRepository } from './adapters/out/repositories/notification.repository';
import { SellerProfileRepository } from './adapters/out/repositories/seller-profile.repository';
import { StubEmailSenderService } from './adapters/out/external/stub-email-sender.service';
import { NOTIFICATION_EVENT_SERVICE } from './core/interfaces/services/notification-event.service.interface';
import { NOTIFICATION_QUERY_SERVICE } from './core/interfaces/services/notification-query.service.interface';
import { USER_CONTACT_REPOSITORY } from './core/interfaces/repositories/user-contact-repository.interface';
import { NOTIFICATION_REPOSITORY } from './core/interfaces/repositories/notification-repository.interface';
import { SELLER_PROFILE_REPOSITORY } from './core/interfaces/repositories/seller-profile-repository.interface';
import { EMAIL_SENDER } from './core/interfaces/external/email-sender.interface';

@Module({
  imports: [JwtModule.register({})],
  controllers: [NotificationsController],
  providers: [
    { provide: NOTIFICATION_EVENT_SERVICE, useClass: NotificationEventService },
    { provide: NOTIFICATION_QUERY_SERVICE, useClass: NotificationQueryService },
    { provide: USER_CONTACT_REPOSITORY, useClass: UserContactRepository },
    { provide: NOTIFICATION_REPOSITORY, useClass: NotificationRepository },
    { provide: SELLER_PROFILE_REPOSITORY, useClass: SellerProfileRepository },
    { provide: EMAIL_SENDER, useClass: StubEmailSenderService },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    JwtAuthGuard,
    AuthEventsConsumer,
    OrderEventsConsumer,
    PaymentEventsConsumer,
    ShippingEventsConsumer,
    CatalogEventsConsumer,
    ReviewEventsConsumer,
  ],
})
export class NotificationModule {}
```

- [ ] **Step 2: Run the full test suite**

Run: `cd Micro-services/notification && npx jest`
Expected: PASS across every spec file in the service.

- [ ] **Step 3: Verify the app boots**

Run: `cd Micro-services/notification && npm run build && node dist/main.js &` then check the log for a clean Nest bootstrap with no `UnknownDependenciesException`. Kill the process afterward.
Expected: no DI wiring errors.

- [ ] **Step 4: Commit**

```bash
cd Micro-services/notification
git add src/notification.module.ts
git commit -m "feat(notification): wire SellerProfile repo and the two new event consumers"
```

---

## Task 17: infra + docs — topic list and event catalog

**Files:**
- Modify: `scripts/README-saga.md`
- Modify: `docs/superpowers/specs/2026-07-08-api-endpoints-and-events-design.md`

**Interfaces:** none — documentation/config only.

- [ ] **Step 1: Add `review-events` to the Kafka topic pre-create list**

In `scripts/README-saga.md`, find the `createTopics` line (inside the `node -e "..."` command under "Pre-create the Kafka topics") and add `'review-events'` to the array:

Before:
```
topics:['auth-events','catalog-events','inventory-events','order-events','payment-events','shipping-events']
```

After:
```
topics:['auth-events','catalog-events','inventory-events','order-events','payment-events','review-events','shipping-events']
```

- [ ] **Step 2: Document the new endpoint and event catalog**

In `docs/superpowers/specs/2026-07-08-api-endpoints-and-events-design.md`:
- Under `### order-service` (endpoints table), add a row for `GET /orders/:id/verify-purchase?productId=` (JWT, 200 `{ eligible, sellerId? }`, 403/404 same as `GET /orders/:id`).
- Under `## Catálogo de eventos (tópicos + payloads)`, add a new `### \`review-events\`` section documenting `ReviewSent { reviewId, customerId, productId, sellerId, grade, comment, orderId }` (key = `reviewId`).
- Under `### notification-service`, add a line noting it now also consumes `review-events` (`ReviewSent` → e-mail pro seller) and `catalog-events`' `SellerOnboarded` (read-model `SellerProfile`).
- Under `## Fora de escopo (YAGNI, deixado pra depois)`, remove or amend the line `"Cupons/descontos, reviews — já fora de escopo no spec de banco anterior, continua valendo aqui."` so it no longer lists reviews as out of scope (keep cupons/descontos as still out of scope) — e.g. change it to `"Cupons/descontos — já fora de escopo no spec de banco anterior, continua valendo aqui. Reviews saíram de escopo: ver docs/superpowers/specs/2026-07-21-review-purchase-validation-design.md."`

- [ ] **Step 3: Commit**

```bash
git add scripts/README-saga.md docs/superpowers/specs/2026-07-08-api-endpoints-and-events-design.md
git commit -m "docs: document review-events topic, verify-purchase endpoint and seller email"
```

---

## Final check (run after all 17 tasks)

- [ ] Run every touched service's full test suite once more from a clean state:

```bash
cd Micro-services/order && npx jest
cd ../review && npx jest
cd ../notification && npx jest
```

Expected: all green, no `.only`/`.skip` left behind.

- [ ] Confirm no service's `main.ts`, `*.module.ts`, or `.env` was left half-edited: `git status` in the repo root should show a clean tree (everything committed task-by-task above).
