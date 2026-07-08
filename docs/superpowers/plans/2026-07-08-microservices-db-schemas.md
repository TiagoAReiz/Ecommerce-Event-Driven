# Microservices DB Schemas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Prisma schema (models, enums, migration) for each of the 8 microservice databases, exactly as designed in `docs/superpowers/specs/2026-07-08-microservices-db-schema-design.md`, each verified by an integration test that hits the real dockerized Postgres instance.

**Architecture:** Each microservice (`auth`, `catalog`, `cart`, `inventory`, `order`, `payment`, `shipping`, `notification`) owns an isolated Postgres database and an isolated `prisma/schema.prisma`. There is no shared code or shared database between services — every task in this plan is independent and touches exactly one service. This plan covers **only the data layer**: models, enums, migrations, and schema-level constraints (uniques, FKs, defaults). It does **not** implement Kafka producers/consumers, the actual saga logic, or the Correios/Mercado Pago integrations — those consume the `OutboxEvent`/`ProcessedEvent` tables this plan creates, but are separate future work.

**Tech Stack:** NestJS 11, Prisma 7.8 (`@prisma/adapter-pg` driver adapter), PostgreSQL 16, Jest 30 + ts-jest (e2e tests against the real dockerized DB, no mocking), Docker Compose v5.

## Global Constraints

- Every model's primary key: `id String @id @default(uuid())`, except fields that are a logical reference to another service's ID (e.g. `Seller.userId`, `StockItem.variantId`) — those are plain `String` with no default, no FK (different database).
- Every monetary field: `Decimal @db.Decimal(12,2)`. Never `Float`/`Int` for money.
- Every model has `createdAt DateTime @default(now())` and, when the row is mutated after creation, `updatedAt DateTime @updatedAt`.
- `OutboxEvent` model (publish side) is required in: **auth, catalog, inventory, order, payment, shipping**. Not needed in **cart** (publishes nothing) or **notification** (publishes nothing).
- `ProcessedEvent` model (consume/idempotency side) is required in: **inventory, order, payment, shipping, notification**. Not needed in **auth**, **catalog**, or **cart** (none of them consume Kafka events in this design). `ProcessedEvent` is a deliberate exception to the "every model has `createdAt`/`updatedAt`" rule above: it uses `processedAt DateTime @default(now())` instead — a more descriptive name for a row that is created once, never mutated, and needs no `updatedAt`. Confirmed by the human on 2026-07-08; do not re-flag this in review.
- Same deliberate exception applies to any other model that is a write-once, never-mutated log/snapshot row: `MpWebhookEvent` (payment-db) uses `receivedAt`/`processedAt` instead of `createdAt`/`updatedAt`; `FreightQuote` (shipping-db) uses `requestedAt` only, no `updatedAt` (it's the frozen winning quote, never edited after creation). Do not re-flag these either. Every OTHER model (including `SellerPaymentProfile` and `NotificationLog`, both of which ARE mutated post-creation) must still carry `createdAt`/`updatedAt` per the blanket rule.
- All test files are integration tests (`*.e2e-spec.ts` under `test/`) that connect to the real dockerized Postgres via the service's own `PrismaService` — no mocking of Prisma.
- Every test that creates rows must track the created IDs and delete them in `afterAll`, so the suite is safely re-runnable against the shared dev database.

---

### Task 1: Bring up all 8 Postgres containers

**Files:** none (infrastructure only, no code changes — no commit for this task).

**Interfaces:**
- Consumes: `docker-compose.yml` (already defines `auth-db`, `catalog-db`, `cart-db`, `inventory-db`, `order-db`, `payment-db`, `shipping-db`, `notification-db`) and the root `.env` (already has `*_DB_USER`/`*_DB_PASSWORD`/`*_DB_NAME`/`*_DB_PORT` for all 8).
- Produces: 8 running, healthy Postgres containers reachable at the `localhost` ports declared in each service's own `Micro-services/<service>/.env` (`DATABASE_URL`). Every later task depends on this.

- [ ] **Step 1: Start the 8 database containers**

Run (from repo root):
```bash
docker compose up -d --wait auth-db catalog-db cart-db inventory-db order-db payment-db shipping-db notification-db
```
Expected: command exits 0; each container reaches its healthcheck (`pg_isready`) within the default wait timeout.

- [ ] **Step 2: Verify all 8 are healthy**

Run:
```bash
docker compose ps auth-db catalog-db cart-db inventory-db order-db payment-db shipping-db notification-db
```
Expected: all 8 rows show `running (healthy)`.

---

### Task 2: auth-db schema (`User`)

**Files:**
- Modify: `Micro-services/auth/prisma/schema.prisma`
- Create: `Micro-services/auth/test/prisma.e2e-spec.ts`

**Interfaces:**
- Consumes: `auth-db` container from Task 1 via `DATABASE_URL` in `Micro-services/auth/.env`; `PrismaService` at `Micro-services/auth/src/adapters/out/database/prisma.service.ts` (already exists, unchanged).
- Produces: `User` model (fields: `id, googleId, email, name, avatarUrl, role, createdAt, updatedAt`) and `OutboxEvent`/`OutboxStatus`, available via `PrismaClient` for the auth-service application code (future work, not this plan).

- [ ] **Step 1: Write the failing test**

Create `Micro-services/auth/test/prisma.e2e-spec.ts`:
```ts
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('auth-db schema', () => {
  let prisma: PrismaService;
  const createdUserIds: string[] = [];
  const createdOutboxIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { id: { in: createdOutboxIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.onModuleDestroy();
  });

  it('creates a User with default role CUSTOMER', async () => {
    const user = await prisma.user.create({
      data: {
        googleId: `google-${randomUUID()}`,
        email: `${randomUUID()}@example.com`,
        name: 'Test User',
      },
    });
    createdUserIds.push(user.id);

    expect(user.role).toBe('CUSTOMER');
  });

  it('rejects a duplicate googleId', async () => {
    const googleId = `google-${randomUUID()}`;
    const user = await prisma.user.create({
      data: { googleId, email: `${randomUUID()}@example.com`, name: 'Original' },
    });
    createdUserIds.push(user.id);

    await expect(
      prisma.user.create({
        data: { googleId, email: `${randomUUID()}@example.com`, name: 'Duplicate' },
      }),
    ).rejects.toThrow();
  });

  it('creates an OutboxEvent with default status PENDING', async () => {
    const event = await prisma.outboxEvent.create({
      data: {
        aggregateType: 'User',
        aggregateId: randomUUID(),
        eventType: 'UserRegistered',
        payload: { email: 'test@example.com' },
      },
    });
    createdOutboxIds.push(event.id);

    expect(event.status).toBe('PENDING');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `Micro-services/auth/`):
```bash
npm run test:e2e
```
Expected: FAIL — TypeScript compile error, `Property 'user' does not exist on type 'PrismaService'` (the schema has no models yet, so the generated client has no `user`/`outboxEvent` delegates).

- [ ] **Step 3: Write the schema**

Replace `Micro-services/auth/prisma/schema.prisma` with:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model User {
  id        String   @id @default(uuid())
  googleId  String   @unique
  email     String   @unique
  name      String
  avatarUrl String?
  role      Role     @default(CUSTOMER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum Role {
  CUSTOMER
  SELLER
  ADMIN
}

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

- [ ] **Step 4: Run the migration**

Run (from `Micro-services/auth/`):
```bash
npx prisma migrate dev --name init
```
Expected: creates `Micro-services/auth/prisma/migrations/<timestamp>_init/migration.sql`, applies it to `auth-db`, regenerates the Prisma Client. Exit code 0.

- [ ] **Step 5: Run test to verify it passes**

Run (from `Micro-services/auth/`):
```bash
npm run test:e2e
```
Expected: PASS, 3 passed.

- [ ] **Step 6: Commit**

```bash
git add Micro-services/auth/prisma/schema.prisma Micro-services/auth/prisma/migrations Micro-services/auth/test/prisma.e2e-spec.ts
git commit -m "feat(auth): add User and OutboxEvent schema"
```

---

### Task 3: catalog-db schema (`Seller`, `Category`, `Product`, `ProductVariant`)

**Files:**
- Modify: `Micro-services/catalog/prisma/schema.prisma`
- Create: `Micro-services/catalog/test/prisma.e2e-spec.ts`

**Interfaces:**
- Consumes: `catalog-db` container from Task 1; `PrismaService` at `Micro-services/catalog/src/adapters/out/database/prisma.service.ts`.
- Produces: `Seller`, `Category`, `Product`, `ProductVariant` models, `OutboxEvent`/`OutboxStatus`. `Seller.mpCollectorId` and `Seller.userId` are the fields payment-service and auth-service will reference by value (future work).

- [ ] **Step 1: Write the failing test**

Create `Micro-services/catalog/test/prisma.e2e-spec.ts`:
```ts
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('catalog-db schema', () => {
  let prisma: PrismaService;
  const createdVariantIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdSellerIds: string[] = [];
  const createdOutboxIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { id: { in: createdOutboxIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.seller.deleteMany({ where: { id: { in: createdSellerIds } } });
    await prisma.onModuleDestroy();
  });

  it('creates a Seller -> Category -> Product -> ProductVariant chain', async () => {
    const seller = await prisma.seller.create({
      data: {
        userId: randomUUID(),
        storeName: 'Loja Teste',
        slug: `loja-teste-${randomUUID()}`,
        document: '12345678900',
        mpCollectorId: 'mp-collector-123',
      },
    });
    createdSellerIds.push(seller.id);
    expect(seller.status).toBe('PENDING');

    const category = await prisma.category.create({
      data: { name: 'Eletrônicos', slug: `eletronicos-${randomUUID()}` },
    });
    createdCategoryIds.push(category.id);

    const product = await prisma.product.create({
      data: {
        sellerId: seller.id,
        categoryId: category.id,
        title: 'Fone de ouvido',
        description: 'Fone bluetooth',
      },
    });
    createdProductIds.push(product.id);
    expect(product.status).toBe('ACTIVE');

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `SKU-${randomUUID()}`,
        attributes: { color: 'Preto' },
        price: '199.90',
        weightGrams: 250,
        heightCm: 5,
        widthCm: 10,
        lengthCm: 15,
      },
    });
    createdVariantIds.push(variant.id);
    expect(variant.price.toString()).toBe('199.9');

    const sellerWithProducts = await prisma.seller.findUniqueOrThrow({
      where: { id: seller.id },
      include: { products: true },
    });
    expect(sellerWithProducts.products).toHaveLength(1);
  });

  it('rejects a duplicate ProductVariant sku', async () => {
    const seller = await prisma.seller.create({
      data: {
        userId: randomUUID(),
        storeName: 'Loja Duplicada',
        slug: `loja-dup-${randomUUID()}`,
        document: '00000000000',
        mpCollectorId: 'mp-collector-dup',
      },
    });
    createdSellerIds.push(seller.id);

    const category = await prisma.category.create({
      data: { name: 'Moda', slug: `moda-${randomUUID()}` },
    });
    createdCategoryIds.push(category.id);

    const product = await prisma.product.create({
      data: {
        sellerId: seller.id,
        categoryId: category.id,
        title: 'Camiseta',
        description: 'Camiseta básica',
      },
    });
    createdProductIds.push(product.id);

    const sku = `SKU-${randomUUID()}`;
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku,
        attributes: { size: 'M' },
        price: '49.90',
        weightGrams: 150,
        heightCm: 2,
        widthCm: 20,
        lengthCm: 25,
      },
    });
    createdVariantIds.push(variant.id);

    await expect(
      prisma.productVariant.create({
        data: {
          productId: product.id,
          sku,
          attributes: { size: 'G' },
          price: '49.90',
          weightGrams: 160,
          heightCm: 2,
          widthCm: 20,
          lengthCm: 25,
        },
      }),
    ).rejects.toThrow();
  });

  it('creates an OutboxEvent with default status PENDING', async () => {
    const event = await prisma.outboxEvent.create({
      data: {
        aggregateType: 'Product',
        aggregateId: randomUUID(),
        eventType: 'ProductCreated',
        payload: { title: 'Fone de ouvido' },
      },
    });
    createdOutboxIds.push(event.id);
    expect(event.status).toBe('PENDING');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `Micro-services/catalog/`):
```bash
npm run test:e2e
```
Expected: FAIL — TypeScript compile error, `Property 'seller' does not exist on type 'PrismaService'`.

- [ ] **Step 3: Write the schema**

Replace `Micro-services/catalog/prisma/schema.prisma` with:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model Seller {
  id            String       @id @default(uuid())
  userId        String       @unique
  storeName     String
  slug          String       @unique
  document      String
  mpCollectorId String
  status        SellerStatus @default(PENDING)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  products      Product[]
}

enum SellerStatus {
  PENDING
  ACTIVE
  SUSPENDED
}

model Category {
  id        String    @id @default(uuid())
  name      String
  slug      String    @unique
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  products  Product[]
}

model Product {
  id          String        @id @default(uuid())
  sellerId    String
  seller      Seller        @relation(fields: [sellerId], references: [id])
  categoryId  String
  category    Category      @relation(fields: [categoryId], references: [id])
  title       String
  description String
  status      ProductStatus @default(ACTIVE)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  variants    ProductVariant[]
}

enum ProductStatus {
  ACTIVE
  PAUSED
  DELETED
}

model ProductVariant {
  id          String   @id @default(uuid())
  productId   String
  product     Product  @relation(fields: [productId], references: [id])
  sku         String   @unique
  attributes  Json
  price       Decimal  @db.Decimal(12, 2)
  weightGrams Int
  heightCm    Int
  widthCm     Int
  lengthCm    Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

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

- [ ] **Step 4: Run the migration**

Run (from `Micro-services/catalog/`):
```bash
npx prisma migrate dev --name init
```
Expected: exit code 0, migration applied to `catalog-db`, client regenerated.

- [ ] **Step 5: Run test to verify it passes**

Run (from `Micro-services/catalog/`):
```bash
npm run test:e2e
```
Expected: PASS, 3 passed.

- [ ] **Step 6: Commit**

```bash
git add Micro-services/catalog/prisma/schema.prisma Micro-services/catalog/prisma/migrations Micro-services/catalog/test/prisma.e2e-spec.ts
git commit -m "feat(catalog): add Seller, Category, Product and ProductVariant schema"
```

---

### Task 4: cart-db schema (`Cart`, `CartItem`)

**Files:**
- Modify: `Micro-services/cart/prisma/schema.prisma`
- Create: `Micro-services/cart/test/prisma.e2e-spec.ts`

**Interfaces:**
- Consumes: `cart-db` container from Task 1; `PrismaService` at `Micro-services/cart/src/adapters/out/database/prisma.service.ts`.
- Produces: `Cart`, `CartItem` models. No `OutboxEvent`/`ProcessedEvent` (cart-service is checkout's synchronous read source, not an event participant).

- [ ] **Step 1: Write the failing test**

Create `Micro-services/cart/test/prisma.e2e-spec.ts`:
```ts
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('cart-db schema', () => {
  let prisma: PrismaService;
  const createdCartIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.cartItem.deleteMany({ where: { cartId: { in: createdCartIds } } });
    await prisma.cart.deleteMany({ where: { id: { in: createdCartIds } } });
    await prisma.onModuleDestroy();
  });

  it('creates a Cart with a CartItem', async () => {
    const cart = await prisma.cart.create({ data: { userId: randomUUID() } });
    createdCartIds.push(cart.id);

    const item = await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        variantId: randomUUID(),
        sellerId: randomUUID(),
        quantity: 2,
        unitPriceSnapshot: '49.90',
      },
    });

    expect(item.quantity).toBe(2);
  });

  it('rejects a duplicate variant in the same cart', async () => {
    const cart = await prisma.cart.create({ data: { userId: randomUUID() } });
    createdCartIds.push(cart.id);

    const variantId = randomUUID();
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        variantId,
        sellerId: randomUUID(),
        quantity: 1,
        unitPriceSnapshot: '10.00',
      },
    });

    await expect(
      prisma.cartItem.create({
        data: {
          cartId: cart.id,
          variantId,
          sellerId: randomUUID(),
          quantity: 3,
          unitPriceSnapshot: '10.00',
        },
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `Micro-services/cart/`):
```bash
npm run test:e2e
```
Expected: FAIL — TypeScript compile error, `Property 'cart' does not exist on type 'PrismaService'`.

- [ ] **Step 3: Write the schema**

Replace `Micro-services/cart/prisma/schema.prisma` with:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model Cart {
  id        String     @id @default(uuid())
  userId    String     @unique
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  items     CartItem[]
}

model CartItem {
  id                String   @id @default(uuid())
  cartId            String
  cart              Cart     @relation(fields: [cartId], references: [id])
  variantId         String
  sellerId          String
  quantity          Int
  unitPriceSnapshot Decimal  @db.Decimal(12, 2)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([cartId, variantId])
}
```

- [ ] **Step 4: Run the migration**

Run (from `Micro-services/cart/`):
```bash
npx prisma migrate dev --name init
```
Expected: exit code 0, migration applied to `cart-db`, client regenerated.

- [ ] **Step 5: Run test to verify it passes**

Run (from `Micro-services/cart/`):
```bash
npm run test:e2e
```
Expected: PASS, 2 passed.

- [ ] **Step 6: Commit**

```bash
git add Micro-services/cart/prisma/schema.prisma Micro-services/cart/prisma/migrations Micro-services/cart/test/prisma.e2e-spec.ts
git commit -m "feat(cart): add Cart and CartItem schema"
```

---

### Task 5: inventory-db schema (`StockItem`, `StockReservation`)

**Files:**
- Modify: `Micro-services/inventory/prisma/schema.prisma`
- Create: `Micro-services/inventory/test/prisma.e2e-spec.ts`

**Interfaces:**
- Consumes: `inventory-db` container from Task 1; `PrismaService` at `Micro-services/inventory/src/adapters/out/database/prisma.service.ts`.
- Produces: `StockItem`, `StockReservation` models, `OutboxEvent`/`OutboxStatus`, `ProcessedEvent`.

- [ ] **Step 1: Write the failing test**

Create `Micro-services/inventory/test/prisma.e2e-spec.ts`:
```ts
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('inventory-db schema', () => {
  let prisma: PrismaService;
  const createdStockItemIds: string[] = [];
  const createdReservationIds: string[] = [];
  const createdProcessedEventIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.processedEvent.deleteMany({ where: { id: { in: createdProcessedEventIds } } });
    await prisma.stockReservation.deleteMany({ where: { id: { in: createdReservationIds } } });
    await prisma.stockItem.deleteMany({ where: { id: { in: createdStockItemIds } } });
    await prisma.onModuleDestroy();
  });

  it('reserves stock against a StockItem', async () => {
    const variantId = randomUUID();
    const stockItem = await prisma.stockItem.create({
      data: { variantId, sellerId: randomUUID(), quantity: 10 },
    });
    createdStockItemIds.push(stockItem.id);

    const reservation = await prisma.stockReservation.create({
      data: {
        variantId,
        subOrderId: randomUUID(),
        quantity: 3,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    createdReservationIds.push(reservation.id);
    expect(reservation.status).toBe('PENDING');

    const updated = await prisma.stockItem.update({
      where: { id: stockItem.id },
      data: { reservedQty: { increment: reservation.quantity } },
    });
    expect(updated.quantity - updated.reservedQty).toBe(7);
  });

  it('rejects a duplicate variantId in StockItem', async () => {
    const variantId = randomUUID();
    const stockItem = await prisma.stockItem.create({
      data: { variantId, sellerId: randomUUID(), quantity: 5 },
    });
    createdStockItemIds.push(stockItem.id);

    await expect(
      prisma.stockItem.create({ data: { variantId, sellerId: randomUUID(), quantity: 1 } }),
    ).rejects.toThrow();
  });

  it('rejects a duplicate ProcessedEvent eventId', async () => {
    const eventId = randomUUID();
    const processed = await prisma.processedEvent.create({
      data: { eventId, eventType: 'OrderCreated' },
    });
    createdProcessedEventIds.push(processed.id);

    await expect(
      prisma.processedEvent.create({ data: { eventId, eventType: 'OrderCreated' } }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `Micro-services/inventory/`):
```bash
npm run test:e2e
```
Expected: FAIL — TypeScript compile error, `Property 'stockItem' does not exist on type 'PrismaService'`.

- [ ] **Step 3: Write the schema**

Replace `Micro-services/inventory/prisma/schema.prisma` with:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model StockItem {
  id          String   @id @default(uuid())
  variantId   String   @unique
  sellerId    String
  quantity    Int      @default(0)
  reservedQty Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model StockReservation {
  id         String            @id @default(uuid())
  variantId  String
  subOrderId String
  quantity   Int
  status     ReservationStatus @default(PENDING)
  expiresAt  DateTime
  createdAt  DateTime          @default(now())
  updatedAt  DateTime          @updatedAt
}

enum ReservationStatus {
  PENDING
  CONFIRMED
  RELEASED
  EXPIRED
}

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

model ProcessedEvent {
  id          String   @id @default(uuid())
  eventId     String   @unique
  eventType   String
  processedAt DateTime @default(now())
}
```

- [ ] **Step 4: Run the migration**

Run (from `Micro-services/inventory/`):
```bash
npx prisma migrate dev --name init
```
Expected: exit code 0, migration applied to `inventory-db`, client regenerated.

- [ ] **Step 5: Run test to verify it passes**

Run (from `Micro-services/inventory/`):
```bash
npm run test:e2e
```
Expected: PASS, 3 passed.

- [ ] **Step 6: Commit**

```bash
git add Micro-services/inventory/prisma/schema.prisma Micro-services/inventory/prisma/migrations Micro-services/inventory/test/prisma.e2e-spec.ts
git commit -m "feat(inventory): add StockItem and StockReservation schema"
```

---

### Task 6: order-db schema (`Order`, `SubOrder`, `OrderItem`)

**Files:**
- Modify: `Micro-services/order/prisma/schema.prisma`
- Create: `Micro-services/order/test/prisma.e2e-spec.ts`

**Interfaces:**
- Consumes: `order-db` container from Task 1; `PrismaService` at `Micro-services/order/src/adapters/out/database/prisma.service.ts`.
- Produces: `Order`, `SubOrder`, `OrderItem` models, `OutboxEvent`/`OutboxStatus`, `ProcessedEvent`.

- [ ] **Step 1: Write the failing test**

Create `Micro-services/order/test/prisma.e2e-spec.ts`:
```ts
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('order-db schema', () => {
  let prisma: PrismaService;
  const createdOrderIds: string[] = [];
  const createdSubOrderIds: string[] = [];
  const createdItemIds: string[] = [];
  const createdProcessedEventIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.processedEvent.deleteMany({ where: { id: { in: createdProcessedEventIds } } });
    await prisma.orderItem.deleteMany({ where: { id: { in: createdItemIds } } });
    await prisma.subOrder.deleteMany({ where: { id: { in: createdSubOrderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    await prisma.onModuleDestroy();
  });

  it('creates an Order -> SubOrder -> OrderItem chain', async () => {
    const order = await prisma.order.create({
      data: { userId: randomUUID(), addressId: randomUUID(), totalAmount: '259.80' },
    });
    createdOrderIds.push(order.id);
    expect(order.status).toBe('PENDING');

    const subOrder = await prisma.subOrder.create({
      data: { orderId: order.id, sellerId: randomUUID(), subtotalAmount: '259.80' },
    });
    createdSubOrderIds.push(subOrder.id);
    expect(subOrder.status).toBe('PENDING');
    expect(subOrder.stockReservedAt).toBeNull();

    const item = await prisma.orderItem.create({
      data: {
        subOrderId: subOrder.id,
        variantId: randomUUID(),
        skuSnapshot: 'SKU-1',
        titleSnapshot: 'Fone de ouvido',
        unitPriceSnapshot: '259.80',
        quantity: 1,
        weightGramsSnapshot: 250,
      },
    });
    createdItemIds.push(item.id);

    const orderWithChildren = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { subOrders: { include: { items: true } } },
    });
    expect(orderWithChildren.subOrders[0].items).toHaveLength(1);
  });

  it('marks a SubOrder READY once stock and freight timestamps are set', async () => {
    const order = await prisma.order.create({
      data: { userId: randomUUID(), addressId: randomUUID(), totalAmount: '99.90' },
    });
    createdOrderIds.push(order.id);

    const subOrder = await prisma.subOrder.create({
      data: { orderId: order.id, sellerId: randomUUID(), subtotalAmount: '99.90' },
    });
    createdSubOrderIds.push(subOrder.id);

    const updated = await prisma.subOrder.update({
      where: { id: subOrder.id },
      data: {
        stockReservedAt: new Date(),
        freightQuotedAt: new Date(),
        shippingAmount: '15.00',
        status: 'READY',
      },
    });
    expect(updated.status).toBe('READY');
    expect(updated.shippingAmount?.toString()).toBe('15');
  });

  it('rejects a duplicate ProcessedEvent eventId', async () => {
    const eventId = randomUUID();
    const processed = await prisma.processedEvent.create({
      data: { eventId, eventType: 'StockReserved' },
    });
    createdProcessedEventIds.push(processed.id);

    await expect(
      prisma.processedEvent.create({ data: { eventId, eventType: 'StockReserved' } }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `Micro-services/order/`):
```bash
npm run test:e2e
```
Expected: FAIL — TypeScript compile error, `Property 'order' does not exist on type 'PrismaService'`.

- [ ] **Step 3: Write the schema**

Replace `Micro-services/order/prisma/schema.prisma` with:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model Order {
  id          String      @id @default(uuid())
  userId      String
  addressId   String
  status      OrderStatus @default(PENDING)
  totalAmount Decimal     @db.Decimal(12, 2)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  subOrders   SubOrder[]
}

enum OrderStatus {
  PENDING
  READY_FOR_PAYMENT
  AWAITING_PAYMENT
  PAID
  PARTIALLY_FULFILLED
  COMPLETED
  CANCELLED
}

model SubOrder {
  id              String         @id @default(uuid())
  orderId         String
  order           Order          @relation(fields: [orderId], references: [id])
  sellerId        String
  status          SubOrderStatus @default(PENDING)
  subtotalAmount  Decimal        @db.Decimal(12, 2)
  shippingAmount  Decimal?       @db.Decimal(12, 2)
  stockReservedAt DateTime?
  freightQuotedAt DateTime?
  cancelReason    String?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  items           OrderItem[]
}

enum SubOrderStatus {
  PENDING
  READY
  PAYMENT_CONFIRMED
  PROCESSING
  SHIPPED
  DELIVERED
  CANCELLED
  REFUNDED
}

model OrderItem {
  id                  String   @id @default(uuid())
  subOrderId          String
  subOrder            SubOrder @relation(fields: [subOrderId], references: [id])
  variantId           String
  skuSnapshot         String
  titleSnapshot       String
  unitPriceSnapshot   Decimal  @db.Decimal(12, 2)
  quantity            Int
  weightGramsSnapshot Int
  createdAt           DateTime @default(now())
}

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

model ProcessedEvent {
  id          String   @id @default(uuid())
  eventId     String   @unique
  eventType   String
  processedAt DateTime @default(now())
}
```

- [ ] **Step 4: Run the migration**

Run (from `Micro-services/order/`):
```bash
npx prisma migrate dev --name init
```
Expected: exit code 0, migration applied to `order-db`, client regenerated.

- [ ] **Step 5: Run test to verify it passes**

Run (from `Micro-services/order/`):
```bash
npm run test:e2e
```
Expected: PASS, 3 passed.

- [ ] **Step 6: Commit**

```bash
git add Micro-services/order/prisma/schema.prisma Micro-services/order/prisma/migrations Micro-services/order/test/prisma.e2e-spec.ts
git commit -m "feat(order): add Order, SubOrder and OrderItem schema"
```

---

### Task 7: payment-db schema (`Payment`, `PaymentSplit`, `MpWebhookEvent`, `SellerPaymentProfile`)

**Files:**
- Modify: `Micro-services/payment/prisma/schema.prisma`
- Create: `Micro-services/payment/test/prisma.e2e-spec.ts`

**Interfaces:**
- Consumes: `payment-db` container from Task 1; `PrismaService` at `Micro-services/payment/src/adapters/out/database/prisma.service.ts`.
- Produces: `Payment`, `PaymentSplit`, `MpWebhookEvent`, `SellerPaymentProfile` models, `OutboxEvent`/`OutboxStatus`, `ProcessedEvent`.

- [ ] **Step 1: Write the failing test**

Create `Micro-services/payment/test/prisma.e2e-spec.ts`:
```ts
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('payment-db schema', () => {
  let prisma: PrismaService;
  const createdPaymentIds: string[] = [];
  const createdSplitIds: string[] = [];
  const createdWebhookIds: string[] = [];
  const createdSellerProfileIds: string[] = [];
  const createdOutboxIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { id: { in: createdOutboxIds } } });
    await prisma.mpWebhookEvent.deleteMany({ where: { id: { in: createdWebhookIds } } });
    await prisma.paymentSplit.deleteMany({ where: { id: { in: createdSplitIds } } });
    await prisma.payment.deleteMany({ where: { id: { in: createdPaymentIds } } });
    await prisma.sellerPaymentProfile.deleteMany({
      where: { sellerId: { in: createdSellerProfileIds } },
    });
    await prisma.onModuleDestroy();
  });

  it('creates a Payment with a split per seller', async () => {
    const sellerId = randomUUID();
    const profile = await prisma.sellerPaymentProfile.create({
      data: { sellerId, mpCollectorId: 'mp-collector-1' },
    });
    createdSellerProfileIds.push(profile.sellerId);

    const payment = await prisma.payment.create({
      data: {
        orderId: randomUUID(),
        userId: randomUUID(),
        method: 'PIX',
        totalAmount: '150.00',
      },
    });
    createdPaymentIds.push(payment.id);
    expect(payment.status).toBe('PENDING');

    const split = await prisma.paymentSplit.create({
      data: {
        paymentId: payment.id,
        subOrderId: randomUUID(),
        sellerId,
        mpCollectorId: profile.mpCollectorId,
        amount: '135.00',
        platformFeeAmount: '15.00',
      },
    });
    createdSplitIds.push(split.id);
    expect(split.status).toBe('PENDING');
  });

  it('rejects a duplicate mpEventId in MpWebhookEvent', async () => {
    const mpEventId = randomUUID();
    const webhook = await prisma.mpWebhookEvent.create({
      data: { mpEventId, type: 'payment.updated', rawPayload: { id: 1 } },
    });
    createdWebhookIds.push(webhook.id);

    await expect(
      prisma.mpWebhookEvent.create({
        data: { mpEventId, type: 'payment.updated', rawPayload: { id: 1 } },
      }),
    ).rejects.toThrow();
  });

  it('creates an OutboxEvent with default status PENDING', async () => {
    const event = await prisma.outboxEvent.create({
      data: {
        aggregateType: 'Payment',
        aggregateId: randomUUID(),
        eventType: 'PaymentConfirmed',
        payload: { status: 'APPROVED' },
      },
    });
    createdOutboxIds.push(event.id);
    expect(event.status).toBe('PENDING');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `Micro-services/payment/`):
```bash
npm run test:e2e
```
Expected: FAIL — TypeScript compile error, `Property 'sellerPaymentProfile' does not exist on type 'PrismaService'`.

- [ ] **Step 3: Write the schema**

Replace `Micro-services/payment/prisma/schema.prisma` with:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model Payment {
  id             String         @id @default(uuid())
  orderId        String
  userId         String
  method         PaymentMethod
  status         PaymentStatus  @default(PENDING)
  totalAmount    Decimal        @db.Decimal(12, 2)
  mpPaymentId    String?        @unique
  mpPreferenceId String?        @unique
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  splits         PaymentSplit[]
}

enum PaymentMethod {
  CREDIT_CARD
  PIX
  BOLETO
}

enum PaymentStatus {
  PENDING
  APPROVED
  REJECTED
  EXPIRED
  REFUNDED
}

model PaymentSplit {
  id                String             @id @default(uuid())
  paymentId         String
  payment           Payment            @relation(fields: [paymentId], references: [id])
  subOrderId        String
  sellerId          String
  mpCollectorId     String
  amount            Decimal            @db.Decimal(12, 2)
  platformFeeAmount Decimal            @db.Decimal(12, 2)
  status            PaymentSplitStatus @default(PENDING)
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt
}

enum PaymentSplitStatus {
  PENDING
  SETTLED
  FAILED
}

model MpWebhookEvent {
  id          String    @id @default(uuid())
  mpEventId   String    @unique
  type        String
  rawPayload  Json
  receivedAt  DateTime  @default(now())
  processedAt DateTime?
}

model SellerPaymentProfile {
  sellerId      String   @id
  mpCollectorId String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

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

model ProcessedEvent {
  id          String   @id @default(uuid())
  eventId     String   @unique
  eventType   String
  processedAt DateTime @default(now())
}
```

- [ ] **Step 4: Run the migration**

Run (from `Micro-services/payment/`):
```bash
npx prisma migrate dev --name init
```
Expected: exit code 0, migration applied to `payment-db`, client regenerated.

- [ ] **Step 5: Run test to verify it passes**

Run (from `Micro-services/payment/`):
```bash
npm run test:e2e
```
Expected: PASS, 3 passed.

- [ ] **Step 6: Commit**

```bash
git add Micro-services/payment/prisma/schema.prisma Micro-services/payment/prisma/migrations Micro-services/payment/test/prisma.e2e-spec.ts
git commit -m "feat(payment): add Payment, PaymentSplit, MpWebhookEvent and SellerPaymentProfile schema"
```

---

### Task 8: shipping-db schema (`Address`, `FreightQuote`, `Shipment`)

**Files:**
- Modify: `Micro-services/shipping/prisma/schema.prisma`
- Create: `Micro-services/shipping/test/prisma.e2e-spec.ts`

**Interfaces:**
- Consumes: `shipping-db` container from Task 1; `PrismaService` at `Micro-services/shipping/src/adapters/out/database/prisma.service.ts`.
- Produces: `Address`, `FreightQuote`, `Shipment` models, `OutboxEvent`/`OutboxStatus`, `ProcessedEvent`.

- [ ] **Step 1: Write the failing test**

Create `Micro-services/shipping/test/prisma.e2e-spec.ts`:
```ts
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('shipping-db schema', () => {
  let prisma: PrismaService;
  const createdAddressIds: string[] = [];
  const createdShipmentIds: string[] = [];
  const createdFreightQuoteIds: string[] = [];
  const createdOutboxIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { id: { in: createdOutboxIds } } });
    await prisma.shipment.deleteMany({ where: { id: { in: createdShipmentIds } } });
    await prisma.freightQuote.deleteMany({ where: { id: { in: createdFreightQuoteIds } } });
    await prisma.address.deleteMany({ where: { id: { in: createdAddressIds } } });
    await prisma.onModuleDestroy();
  });

  it('quotes freight and creates a Shipment for the same SubOrder', async () => {
    const address = await prisma.address.create({
      data: {
        ownerType: 'CUSTOMER',
        ownerId: randomUUID(),
        cep: '01310-100',
        street: 'Av. Paulista',
        number: '1000',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
      },
    });
    createdAddressIds.push(address.id);
    expect(address.country).toBe('BR');

    const subOrderId = randomUUID();
    const quote = await prisma.freightQuote.create({
      data: {
        subOrderId,
        originCep: '04001-000',
        destinationCep: address.cep,
        carrier: 'PAC',
        price: '22.50',
        estimatedDays: 6,
      },
    });
    createdFreightQuoteIds.push(quote.id);

    const shipment = await prisma.shipment.create({
      data: { subOrderId, addressId: address.id, carrier: quote.carrier },
    });
    createdShipmentIds.push(shipment.id);
    expect(shipment.status).toBe('LABEL_PENDING');
  });

  it('rejects a second FreightQuote for the same SubOrder', async () => {
    const subOrderId = randomUUID();
    const quote = await prisma.freightQuote.create({
      data: {
        subOrderId,
        originCep: '04001-000',
        destinationCep: '20040-020',
        carrier: 'SEDEX',
        price: '35.00',
        estimatedDays: 2,
      },
    });
    createdFreightQuoteIds.push(quote.id);

    await expect(
      prisma.freightQuote.create({
        data: {
          subOrderId,
          originCep: '04001-000',
          destinationCep: '20040-020',
          carrier: 'SEDEX',
          price: '40.00',
          estimatedDays: 2,
        },
      }),
    ).rejects.toThrow();
  });

  it('creates an OutboxEvent with default status PENDING', async () => {
    const event = await prisma.outboxEvent.create({
      data: {
        aggregateType: 'Shipment',
        aggregateId: randomUUID(),
        eventType: 'ShipmentDispatched',
        payload: { trackingCode: 'BR123456789' },
      },
    });
    createdOutboxIds.push(event.id);
    expect(event.status).toBe('PENDING');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `Micro-services/shipping/`):
```bash
npm run test:e2e
```
Expected: FAIL — TypeScript compile error, `Property 'address' does not exist on type 'PrismaService'`.

- [ ] **Step 3: Write the schema**

Replace `Micro-services/shipping/prisma/schema.prisma` with:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model Address {
  id           String           @id @default(uuid())
  ownerType    AddressOwnerType
  ownerId      String
  cep          String
  street       String
  number       String
  complement   String?
  neighborhood String
  city         String
  state        String
  country      String           @default("BR")
  isDefault    Boolean          @default(false)
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt
  shipments    Shipment[]
}

enum AddressOwnerType {
  CUSTOMER
  SELLER
}

model FreightQuote {
  id             String   @id @default(uuid())
  subOrderId     String   @unique
  originCep      String
  destinationCep String
  carrier        String
  price          Decimal  @db.Decimal(12, 2)
  estimatedDays  Int
  requestedAt    DateTime @default(now())
}

model Shipment {
  id                    String         @id @default(uuid())
  subOrderId            String         @unique
  addressId             String
  address               Address        @relation(fields: [addressId], references: [id])
  carrier               String
  trackingCode          String?
  status                ShipmentStatus @default(LABEL_PENDING)
  estimatedDeliveryDate DateTime?
  createdAt             DateTime       @default(now())
  updatedAt             DateTime       @updatedAt
}

enum ShipmentStatus {
  LABEL_PENDING
  LABEL_CREATED
  POSTED
  IN_TRANSIT
  DELIVERED
  RETURNED
}

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

model ProcessedEvent {
  id          String   @id @default(uuid())
  eventId     String   @unique
  eventType   String
  processedAt DateTime @default(now())
}
```

- [ ] **Step 4: Run the migration**

Run (from `Micro-services/shipping/`):
```bash
npx prisma migrate dev --name init
```
Expected: exit code 0, migration applied to `shipping-db`, client regenerated.

- [ ] **Step 5: Run test to verify it passes**

Run (from `Micro-services/shipping/`):
```bash
npm run test:e2e
```
Expected: PASS, 3 passed.

- [ ] **Step 6: Commit**

```bash
git add Micro-services/shipping/prisma/schema.prisma Micro-services/shipping/prisma/migrations Micro-services/shipping/test/prisma.e2e-spec.ts
git commit -m "feat(shipping): add Address, FreightQuote and Shipment schema"
```

---

### Task 9: notification-db schema (`NotificationLog`)

**Files:**
- Modify: `Micro-services/notification/prisma/schema.prisma`
- Create: `Micro-services/notification/test/prisma.e2e-spec.ts`

**Interfaces:**
- Consumes: `notification-db` container from Task 1; `PrismaService` at `Micro-services/notification/src/adapters/out/database/prisma.service.ts`.
- Produces: `NotificationLog` model, `ProcessedEvent`. No `OutboxEvent` (notification publishes nothing).

- [ ] **Step 1: Write the failing test**

Create `Micro-services/notification/test/prisma.e2e-spec.ts`:
```ts
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('notification-db schema', () => {
  let prisma: PrismaService;
  const createdLogIds: string[] = [];
  const createdProcessedEventIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.notificationLog.deleteMany({ where: { id: { in: createdLogIds } } });
    await prisma.processedEvent.deleteMany({ where: { id: { in: createdProcessedEventIds } } });
    await prisma.onModuleDestroy();
  });

  it('creates a NotificationLog with default status PENDING', async () => {
    const log = await prisma.notificationLog.create({
      data: {
        userId: randomUUID(),
        type: 'ORDER_CREATED',
        recipientEmail: `${randomUUID()}@example.com`,
        subject: 'Seu pedido foi criado',
      },
    });
    createdLogIds.push(log.id);
    expect(log.status).toBe('PENDING');
  });

  it('rejects a duplicate ProcessedEvent eventId', async () => {
    const eventId = randomUUID();
    const processed = await prisma.processedEvent.create({
      data: { eventId, eventType: 'PaymentConfirmed' },
    });
    createdProcessedEventIds.push(processed.id);

    await expect(
      prisma.processedEvent.create({ data: { eventId, eventType: 'PaymentConfirmed' } }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `Micro-services/notification/`):
```bash
npm run test:e2e
```
Expected: FAIL — TypeScript compile error, `Property 'notificationLog' does not exist on type 'PrismaService'`.

- [ ] **Step 3: Write the schema**

Replace `Micro-services/notification/prisma/schema.prisma` with:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model NotificationLog {
  id             String             @id @default(uuid())
  userId         String
  type           NotificationType
  recipientEmail String
  subject        String
  status         NotificationStatus @default(PENDING)
  sentAt         DateTime?
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt
}

enum NotificationType {
  ORDER_CREATED
  PAYMENT_CONFIRMED
  PAYMENT_FAILED
  SHIPMENT_DISPATCHED
  SHIPMENT_DELIVERED
  ORDER_CANCELLED
}

enum NotificationStatus {
  PENDING
  SENT
  FAILED
}

model ProcessedEvent {
  id          String   @id @default(uuid())
  eventId     String   @unique
  eventType   String
  processedAt DateTime @default(now())
}
```

- [ ] **Step 4: Run the migration**

Run (from `Micro-services/notification/`):
```bash
npx prisma migrate dev --name init
```
Expected: exit code 0, migration applied to `notification-db`, client regenerated.

- [ ] **Step 5: Run test to verify it passes**

Run (from `Micro-services/notification/`):
```bash
npm run test:e2e
```
Expected: PASS, 2 passed.

- [ ] **Step 6: Commit**

```bash
git add Micro-services/notification/prisma/schema.prisma Micro-services/notification/prisma/migrations Micro-services/notification/test/prisma.e2e-spec.ts
git commit -m "feat(notification): add NotificationLog schema"
```
