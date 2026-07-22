# Validação de compra na review + evento ReviewSent + e-mail pro seller

## Contexto e escopo

Hoje `POST /reviews` (review-service) aceita `grade`, `comment`, `orderId`, `productId` e
`customerId` direto no body, sem checar se quem está postando realmente comprou o produto, e sem
avisar ninguém que uma review foi criada.

Este design cobre três mudanças encadeadas:

1. review-service passa a validar, antes de salvar, que o `customerId` autenticado comprou de fato
   `productId` no `orderId` informado — via um novo port/adapter pro order-service.
2. Criação de review (não edição) passa a gravar um `OutboxEvent` e publicar `ReviewSent` em
   `review-events`, seguindo o padrão de outbox transacional já usado no payment-service.
3. notification-service ganha um consumer de `review-events` que envia e-mail pro seller do produto
   avisando da nova review (nome do customer, nota, comentário).

Fora de escopo: re-notificar em edição de review; persistir `sellerId` na tabela `Review`; qualquer
UI. Essas exclusões foram decisões explícitas do brainstorming, não lacunas.

## order-service — `GET /orders/:id/verify-purchase`

Novo endpoint, protegido por `JwtAuthGuard` (mesmo guard dos demais endpoints de `OrdersController`):

```
GET /api/v1/orders/:id/verify-purchase?productId=<productId>
```

Regras:
- 404 se o pedido não existe (mesma `OrderNotFoundException` já usada em `getById`).
- 403 se `order.userId !== request.user.sub` (mesma `OrderAccessDeniedException`).
- 400 se `productId` não vier na query.
- Resposta: `{ eligible: boolean, sellerId?: string }`.

Elegibilidade:
- `order.status === 'COMPLETED'` (setado quando todos os sub-orders viram `DELIVERED` — não há
  necessidade de checar sub-order por sub-order, o agregado `Order` já resume isso).
- Resolve `productId -> variantIds` via `ICatalogClient` (novo método `getProductVariantIds`, usando
  o endpoint já existente `GET /products/:id`, que devolve `variants[].id`).
- Cruza esses `variantId` com os `OrderItem.variantId` já carregados pelo `findById` existente
  (`OrderWithSubOrders.subOrders[].items`). Se achar item correspondente, `eligible = true` e
  `sellerId` = `SubOrder.sellerId` daquele item.
- Se `order.status !== 'COMPLETED'` ou nenhum item bater, `eligible = false` (sem `sellerId`).

Implementação:
- `OrderService.verifyPurchase(userId, orderId, productId)`: reusa `orderRepository.findById` (sem
  query nova no order-db) + `catalogClient.getProductVariantIds(productId, accessToken)`.
- `ICatalogClient` ganha `getProductVariantIds(productId, accessToken): Promise<string[] | null>`
  (`null` se o produto não existe no catalog — 404 vira `eligible: false`, não erro).
- Sem migração de schema no order-db.

## review-service

### Fix de autorização (pré-requisito pra validação fazer sentido)

- `ReviewRequest` perde o campo `customerId`.
- `ReviewController.sendReview` passa a extrair `customerId` de `request.user!.sub` (guard já
  popula `request.user`) e o bearer token do header `Authorization`, no mesmo padrão de
  `extractBearerToken` usado em `OrdersController`/`SubOrdersController`.
- `IReviewService.sendReview` muda a assinatura pra receber `customerId` e `accessToken` fora do
  DTO de request (ex.: `sendReview(customerId: string, accessToken: string, review: ReviewRequest)`).

### Novo port pro order-service

- `core/interfaces/external/order-client.interface.ts`:
  ```ts
  export const ORDER_CLIENT = Symbol('ORDER_CLIENT');
  export interface PurchaseVerification { eligible: boolean; sellerId?: string }
  export interface IOrderClient {
    verifyPurchase(accessToken: string, orderId: string, productId: string): Promise<PurchaseVerification>;
  }
  ```
- `adapters/out/external/order-http-client.ts`: `OrderHttpClient implements IOrderClient`, `fetch`
  contra `ORDER_SERVICE_URL` (env, com fallback de dev), repassando `Authorization: Bearer` — mesmo
  esqueleto do `CartHttpClient`/`CatalogHttpClient` do order-service. Erro de rede/timeout lança
  `OrderServiceUnavailableException` (falha fechada — mesmo padrão de `CartUnavailableException` no
  order-service): a review **não** é criada silenciosamente só porque o order-service está fora do
  ar. Só uma resposta HTTP 200 com `eligible: false` conta como "não elegível" de fato.

### Novas exceções + filtro de domínio

- `core/exceptions/product-not-purchased.exception.ts` (`ProductNotPurchasedException`).
- `core/exceptions/order-service-unavailable.exception.ts` (`OrderServiceUnavailableException`).
- `adapters/in/filters/domain-exception.filter.ts` (review-service ainda não tem nenhum) — mapeia
  `ProductNotPurchasedException` pra 403 e `OrderServiceUnavailableException` pra 503, seguindo o
  padrão de `payment`/`order`.

### Outbox transacional

- Migração aditiva no schema do review-db: tabela `OutboxEvent`, idêntica em forma à do
  payment-db (`id`, `aggregateType`, `aggregateId`, `eventType`, `payload` (Json), `status`
  (`OutboxStatus`: `PENDING`/`PUBLISHED`/`FAILED`), `createdAt`, `updatedAt`, `publishedAt`).
- **Nota de deploy:** essa é a primeira migration real (`prisma migrate`) do review-db — antes
  desse trabalho o serviço rodava sem histórico de migration nenhum (schema aplicado via `db push`
  contra o dev server local do Prisma). Em qualquer ambiente onde a tabela `Review` já existir
  fora desse histórico, `prisma migrate deploy` vai falhar com `P3005` ("database schema is not
  empty"). Antes do primeiro deploy nesses ambientes, rodar
  `prisma migrate resolve --applied 20260722191851_init` (e `..._add_outbox_event`, se a tabela
  `OutboxEvent` também já existir) pra baseline o histórico antes de aplicar as migrations de
  verdade. Ambientes com banco vazio (deploy do zero) não precisam desse passo.
- `ReviewService.sendReview`:
  1. chama `orderClient.verifyPurchase(accessToken, orderId, productId)`.
  2. se `!eligible`, lança `ProductNotPurchasedException` — não grava nada.
  3. se já existe review do customer pro produto (`findByCustomerAndProduct`), é update — **não**
     grava `OutboxEvent` (evento só na criação).
  4. se é criação nova: `ReviewRepository.save` passa a abrir uma `$transaction` do Prisma que cria
     o `Review` e o `OutboxEvent` (`aggregateType: 'Review'`, `aggregateId: reviewId`,
     `eventType: 'ReviewSent'`, `payload: { reviewId, customerId, productId, sellerId, grade,
     comment, orderId }`), no mesmo padrão do `payment.repository.ts`.

### Outbox relay

- Novo `OutboxRelayService` (`application/services/outbox-relay.service.ts`), cópia estrutural do
  do payment-service: `@Interval(5000)`, lock por flag `isRelaying`, batch de 20, publica no tópico
  `review-events` (key = `aggregateId` = `reviewId`), envelope padrão (`EventEnvelope`), marca
  `PUBLISHED` após sucesso, loga erro e mantém `PENDING` em falha (retry no próximo tick).
- Reusa `IOutboxEventRepository`/`OutboxEventRepository` e `IEventPublisher`/`KafkaEventPublisher`
  já existentes no review-service (infra de Kafka já está montada, só falta o outbox em si).

## notification-service

### Read-model `SellerProfile` (novo)

- Motivo: catalog não expõe `Seller.userId` publicamente (nem devia — é dado interno, mesmo
  raciocínio do `SellerPaymentProfile` do payment-service). O jeito estabelecido no projeto pra
  resolver `sellerId -> userId` é consumir `SellerOnboarded` de `catalog-events` e manter um
  read-model local.
- Novo consumer `CatalogEventsConsumer` (notification ainda não tem nenhum) tratando
  `SellerOnboarded`, populando `SellerProfile { sellerId, userId }` (upsert idempotente via inbox,
  mesmo padrão de dedupe dos outros consumers).
- Migração aditiva no schema do notification-db: tabela `SellerProfile`.

### Consumer de `review-events`

- Novo `ReviewEventsConsumer`, trata `ReviewSent`:
  1. busca `SellerProfile` por `sellerId` do payload — se não achar (SellerOnboarded ainda não
     processado / redelivery fora de ordem), loga e desiste sem falhar o consumo (não há retry
     estruturado nesse projeto além do at-least-once do Kafka).
  2. busca `UserContact` do seller por `userId` (do profile) — e-mail de destino.
  3. busca `UserContact` do customer por `customerId` (do payload) — só pro nome, no corpo do
     e-mail. Diferente do seller, essa busca é best-effort: se não achar, usa um fallback genérico
     ("Um cliente") no corpo do e-mail em vez de falhar o consumo — o nome é cosmético, não motivo
     pra não notificar o seller.
  4. monta e envia e-mail: assunto tipo "Nova avaliação recebida", corpo com nome do customer,
     nota (`grade`) e `comment`.
  5. segue o mesmo fluxo de idempotência por inbox (`createPendingWithInbox`/`markSent`/`markFailed`)
     já usado em `NotificationEventService` pros outros eventos.

## Infra / documentação

- `scripts/README-saga.md`: adicionar `review-events` na lista de tópicos pré-criados (linha do
  comando de `createTopics`).
- `docs/superpowers/specs/2026-07-08-api-endpoints-and-events-design.md`: adicionar seção
  `review-events` no catálogo de eventos, com o payload de `ReviewSent`, e atualizar a seção
  `notification-service` pra citar o novo e-mail. Atualizar `Fora de escopo` (reviews deixa de estar
  fora de escopo pro fluxo de compra).

## Decisões registradas (do brainstorming)

- Elegibilidade de review = `order.status === 'COMPLETED'`, não checagem por sub-order.
- Validação de variant/produto fica inteiramente no order-service (ele já fala com o catalog);
  review-service ganha só 1 port novo, pro order-service — não fala com catalog diretamente.
- `sellerId` não é persistido na tabela `Review`, só passa pelo payload do evento.
- `ReviewSent` dispara só em criação de review nova, não em edição/update.
- `customerId` deixa de vir do body do `ReviewRequest`; passa a ser derivado do JWT
  (`request.user.sub`), fechando uma brecha de autorização que tornaria a validação de compra
  inútil (dava pra "assinar" a review como outro customerId).

## Testes (a detalhar no plano de implementação)

- order-service: unit do `OrderService.verifyPurchase` (elegível, não elegível por status, não
  elegível por produto não comprado, 403 de ownership, 404 de pedido inexistente, produto
  inexistente no catalog).
- review-service: unit do `ReviewService.sendReview` (bloqueia sem compra, cria com outbox event,
  update não gera outbox event), unit do `OutboxRelayService` (mesmo formato dos specs do
  payment-service), unit do `OrderHttpClient`.
- notification-service: unit do `CatalogEventsConsumer`/`SellerProfile` upsert, unit do
  `ReviewEventsConsumer` (feliz, seller profile ausente, user contact ausente).
