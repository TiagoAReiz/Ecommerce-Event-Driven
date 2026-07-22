# Saga smoke test (cross-service integration)

`saga-smoke-test.mjs` drives the full happy-path choreography against the **live** services and the
docker-compose Kafka/Postgres, asserting the order reaches `PAID` / sub-order `PAYMENT_CONFIRMED`.
It's plain Node (built-in `fetch` + `crypto`, no deps, no test framework).

## What it validates

The end-to-end saga across 6 services + auth's shared JWT:

```
POST /orders (order)
  -> OrderCreated
     -> inventory: StockReserved        (order-events)
     -> shipping:  FreightQuoted         (order-events, needs a SELLER origin address)
  -> order aggregates both per sub-order -> OrderReadyForPayment  (exactly-once)
  -> payment: creates MP preference (stub)
  -> POST /payments/webhook/mercadopago (HMAC-signed) -> PaymentConfirmed
  -> order: SubOrder PAYMENT_CONFIRMED, Order PAID
```

It uses two actors (a **seller** who onboards + owns the product/stock/origin-address, and a
**customer** who buys) because shipping gates `ownerType=SELLER` addresses on the JWT `role` claim.

## Setup (once, before running)

1. **Infra + services.** Bring up the docker infra (the 8 `*-db` + `kafka`), then run the 6 services
   on the host, each on its port:
   ```bash
   # per service:
   cd Micro-services/<svc> && PORT=<port> npm run start
   # catalog:3003 cart:3002 inventory:3004 order:3006 payment:3007 shipping:3008
   ```

2. **Pre-create the Kafka topics.** A consumer that subscribes to a topic which hasn't been produced
   to yet errors with `Broker: Unknown topic or partition` and stalls its run loop. Create all six up
   front (idempotent):
   ```bash
   cd Micro-services/order
   node -e "const{KafkaJS}=require('@confluentinc/kafka-javascript');const k=new KafkaJS.Kafka({kafkaJS:{clientId:'admin',brokers:['localhost:9094']}});(async()=>{const a=k.admin();await a.connect();await a.createTopics({topics:['auth-events','catalog-events','inventory-events','order-events','payment-events','review-events','shipping-events'].map(t=>({topic:t,numPartitions:1,replicationFactor:1}))});await a.disconnect();})()"
   ```
   > In production this is an infra step (pre-provisioned topics or broker `auto.create.topics.enable`).

3. **Seed a category** (catalog categories are seed-only, no write API):
   ```bash
   cd Micro-services/catalog
   printf "INSERT INTO \"Category\" (id,name,slug,\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'Eletronicos','eletronicos',now(),now()) ON CONFLICT (slug) DO NOTHING;" | ./node_modules/.bin/prisma db execute --stdin
   ```

## Run

```bash
node scripts/saga-smoke-test.mjs
```

Exit `0` + `✅ SAGA HAPPY PATH COMPLETED` on success; non-zero with the failing step/assertion otherwise.
Each run uses fresh random users + a unique seller document, so it's safely repeatable.

## Bugs this test caught (that per-service tests could not)

- **cart** read `body.id` from catalog's variant-detail response, but the contract returns `variantId`
  — add-to-cart 500'd. The cart e2e mocked the catalog client, so it never saw the real shape.
- **order** `main.ts` was missing `setGlobalPrefix('api/v1')` — all order routes were served at `/orders`
  instead of `/api/v1/orders`.

It also exercised the **compensation path**: with no seller origin address, shipping emits
`FreightQuoteFailed`, order emits `OrderCancelled`, and inventory releases the reservation
(`StockReleased`).
