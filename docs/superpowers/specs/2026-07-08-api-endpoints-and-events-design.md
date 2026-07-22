# Desenho de endpoints REST e catálogo de eventos por microservice

Data: 2026-07-08

## Contexto e escopo

Continuação de `docs/superpowers/specs/2026-07-08-microservices-db-schema-design.md` (schemas de banco
já implementados e mergeados, ver `docs/STATE.md`). Este documento define:

1. Os endpoints HTTP de cada um dos 8 microservices (`auth`, `catalog`, `cart`, `inventory`, `order`,
   `payment`, `shipping`, `notification`).
2. O catálogo de eventos Kafka em detalhe — tópicos, chave de partição e payload de cada evento (o
   spec anterior só listava nome do evento + publisher/consumer, sem payload).

Decisões que moldam este desenho (confirmadas durante o brainstorming):

- **Sem API Gateway.** O front-end (Next.js, ainda não iniciado) chama cada um dos 8 serviços
  diretamente. Um **Nginx como reverse proxy** na frente de tudo — incluindo o front-end — está
  planejado pra mais adiante (rate limiting, timeouts, roteamento), mas isso é infraestrutura de
  borda, não substitui nada deste desenho. Ver nota em `docs/STATE.md`.
- **JWT stateless.** Auth-service emite o token (assinado); cada serviço valida a assinatura
  localmente, sem round-trip síncrono pro auth-service.
- **Autorização por ownership, não só por role do token.** Rotas "de seller" conferem se existe um
  `Seller` ACTIVE com `userId = req.user.id`, em vez de confiar cegamente na claim `role` do JWT
  (que fica stale até o token ser renovado).
- **Endpoints admin ficam fora de escopo** por ora (sem painel administrativo).
- **Tópico por agregado/serviço** no Kafka (ex: `order-events`), não um tópico por tipo de evento —
  garante ordem entre eventos relacionados do mesmo pedido/subOrder usando a partition key certa.

## Convenções cross-cutting da API

- **Versionamento:** prefixo `/api/v1` em todo serviço.
- **Auth:** header `Authorization: Bearer <jwt>`. Access token curto (~15min) + refresh token (~7
  dias). `POST /api/v1/auth/refresh` emite novo access token. Revogação de refresh token (blacklist/
  sessão) fica **fora de escopo** — logout é só descarte do token no client.
- **Autorização:** role do JWT só faz gate grosso (bloquear rota puramente admin, se existir no
  futuro). Rotas de escrita "de seller" sempre conferem ownership (`Seller.userId == req.user.id`,
  `status = ACTIVE`) diretamente no banco do serviço, não pela claim do token.
- **Erro padrão:** `{ statusCode, error, message, timestamp, path }` (formato default do
  `HttpException` do NestJS).
- **Paginação:** cursor-based (`?cursor=&limit=`) em toda listagem.
- **Idempotência:** header `Idempotency-Key` obrigatório em `POST /api/v1/orders` — evita criar dois
  `Order` (e disparar a saga em duplicidade) num duplo-clique no checkout. Order-service guarda a key
  com TTL curto e retorna o mesmo resultado em replay.
- **Chamadas síncronas entre serviços:** quando um serviço precisa ler dado de outro no meio de uma
  requisição de usuário (ex: checkout), ele **repassa o JWT do próprio usuário** na chamada — não
  existe um credential de serviço-a-serviço separado (mTLS/API key) por ora. Simples porque a chamada
  é sempre "em nome do usuário atual", e o serviço de destino já teria validado o mesmo JWT de
  qualquer forma.

## Endpoints por serviço

### auth-service

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/v1/auth/google` | — | Redireciona pro consent do Google |
| GET | `/api/v1/auth/google/callback` | — | Troca code, cria/acha `User`, emite access+refresh JWT. Se `User` é novo, publica `UserRegistered` |
| POST | `/api/v1/auth/refresh` | refresh token | Emite novo access token |
| GET | `/api/v1/users/me` | JWT | Perfil do usuário logado |

Sem `PATCH /users/me` (nada editável fora do que vem do Google). Novo **consumer**:
`SellerOnboarded` (catalog) → atualiza `User.role` pra `SELLER`, publica `UserRoleChanged`.

### catalog-service

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/v1/categories` | — | Lista categorias (sem endpoint de escrita — seed manual) |
| GET | `/api/v1/products` | — | Busca/lista (filtros: categoryId, sellerId, query, preço), paginado |
| GET | `/api/v1/products/:id` | — | Detalhe + variants |
| GET | `/api/v1/sellers/:id` | — | Vitrine pública do seller |
| GET | `/api/v1/sellers/:id/products` | — | Produtos de um seller |
| POST | `/api/v1/sellers` | JWT (CUSTOMER) | Self-onboarding: cria `Seller` (`ACTIVE` direto, sem aprovação — admin fora de escopo). Publica `SellerOnboarded` |
| GET / PATCH | `/api/v1/sellers/me` | JWT + ownership | Perfil do próprio seller |
| POST | `/api/v1/products` | JWT + ownership | Cria produto. Publica `ProductCreated` |
| PATCH / DELETE | `/api/v1/products/:id` | JWT + ownership | Edita / soft-delete (`status=DELETED`) |
| POST | `/api/v1/products/:id/variants` | JWT + ownership | Cria variant (sku, preço, peso/dimensões) |
| PATCH | `/api/v1/variants/:id` | JWT + ownership | Edita variant; se `price` mudou, publica `ProductVariantPriceChanged` |

Sem `DELETE /variants/:id` (YAGNI — pausar o produto cobre o caso de uso).

**Regra de negócio:** cotação de frete depende do seller ter um `Address(ownerType=SELLER)`
cadastrado no shipping-service (CEP de origem). O onboarding não bloqueia isso automaticamente —
é responsabilidade do front orientar o seller a cadastrar o endereço antes de publicar produtos,
senão a cotação de frete falha silenciosamente na hora do checkout.

### cart-service (sem eventos, só API síncrona)

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/v1/cart` | JWT | Carrinho do usuário (cria vazio se não existir) |
| POST | `/api/v1/cart/items` | JWT | Adiciona item `{variantId, quantity}` — chama catalog-service síncrono pra pegar preço/sellerId atuais |
| PATCH | `/api/v1/cart/items/:id` | JWT + ownership | Atualiza quantidade |
| DELETE | `/api/v1/cart/items/:id` | JWT + ownership | Remove item |
| DELETE | `/api/v1/cart` | JWT | Esvazia carrinho — também chamado internamente pelo order-service pós-checkout |

### inventory-service

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/v1/stock/:variantId` | — | Disponível (`quantity - reservedQty`) — usado na PDP |
| POST | `/api/v1/stock` | JWT + ownership | Seller inicializa `StockItem` pra uma variant |
| PATCH | `/api/v1/stock/:variantId` | JWT + ownership | Seller repõe/corrige quantidade |

Reserva/confirmação/liberação de estoque **não tem endpoint** — 100% reativo a evento
(`OrderCreated`, `PaymentConfirmed`, `PaymentFailed`, `OrderCancelled`).

### order-service

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/api/v1/orders` | JWT + `Idempotency-Key` | Checkout — ver detalhe abaixo |
| GET | `/api/v1/orders` | JWT | Lista pedidos do usuário, paginado |
| GET | `/api/v1/orders/:id` | JWT + ownership | Detalhe com subOrders/items |
| POST | `/api/v1/orders/:id/cancel` | JWT + ownership | Cancelamento (bloqueado depois de `SHIPPED`). Publica `OrderCancelled` |
| GET | `/api/v1/sub-orders` | JWT + ownership (seller) | Dashboard do seller — subOrders dele, filtro por status |
| GET | `/api/v1/sub-orders/:id` | JWT + ownership | Detalhe de um subOrder |
| GET | `/api/v1/orders/:id/verify-purchase?productId=` | JWT + ownership | Verifica se ordem foi paga; retorna `{ eligible, sellerId? }` (usado por review-service pra validar que cliente pode deixar review). 403/404 mesmo que `GET /orders/:id` |

**`POST /orders` faz duas chamadas síncronas antes de gravar** (ambas repassando o JWT do usuário):
1. `GET /api/v1/cart` no cart-service — lê os itens do carrinho.
2. Busca no catalog-service os dados atuais de cada variant (preço, sku, título, peso,
   `heightCm/widthCm/lengthCm`) — necessário pro snapshot em `OrderItem` **e** pro payload de
   `OrderCreated` (shipping precisa das dimensões pra cotar frete real nos Correios).

Só depois disso cria `Order`+`SubOrder`+`OrderItem`, limpa o carrinho (`DELETE /cart`) e publica
`OrderCreated`.

Sem `PATCH` de status em subOrder — toda transição (`READY`, `PAYMENT_CONFIRMED`, `SHIPPED`...) é
reativa a evento, nunca setada via API diretamente.

### payment-service

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/v1/payments/:orderId` | JWT + ownership | Status do pagamento + `init_point` (link de checkout do Mercado Pago) |
| POST | `/api/v1/payments/webhook/mercadopago` | validação por assinatura MP (não JWT) | Recebe webhook, grava `MpWebhookEvent`, publica `PaymentConfirmed`/`PaymentFailed` |
| GET | `/api/v1/payments/splits` | JWT + ownership (seller) | Splits/repasses do seller logado |

A criação da `Payment`/preferência no MP **não é POST do cliente** — é reativa a
`OrderReadyForPayment` (mantém a coreografia).

### shipping-service

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/v1/cep/:cep` | — | Proxy de busca de endereço por CEP (Correios) — autofill de formulário |
| GET | `/api/v1/freight/quote?originCep&destinationCep&weightGrams` | — | Cotação avulsa (preview no carrinho) — **não** persiste `FreightQuote` |
| GET / POST / PATCH / DELETE | `/api/v1/addresses` | JWT + ownership | CRUD de endereço (customer e seller, via `ownerType`) |
| GET | `/api/v1/shipments/:subOrderId` | JWT + ownership | Status/tracking do envio |

A cotação **oficial** por subOrder (que vira `FreightQuote` e trava `SubOrder.shippingAmount`)
continua reativa a `OrderCreated` — o `GET /freight/quote` acima é só estimativa de UX.

### notification-service

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/v1/notifications` | JWT | Histórico de notificações do próprio usuário (não estava no spec original — nice-to-have) |

Sem endpoint de escrita — é puro consumer de eventos.

**Novo read-model local:** `UserContact { userId, email, name }`, alimentado por `UserRegistered`
(auth-events) — necessário porque nenhum evento de negócio (`PaymentConfirmed`, `ShipmentDispatched`
etc.) carrega e-mail, só `userId`; sem esse read-model o notification-service não teria como saber
pra quem mandar. Mesmo padrão já usado pelo `SellerPaymentProfile` no payment-db.

**Consumers adicionais:** `ReviewSent` (review-events) → envia e-mail de aviso de review ao seller; `SellerOnboarded` (catalog-events) → popula read-model `SellerProfile` para enviar e-mails ao seller.

## Mudança de schema necessária (shipping-db)

`FreightQuote` precisa ganhar a coluna `addressId String` (write-once, igual o resto do model) —
sem isso, quando o shipping-service reage a `PaymentConfirmed` pra criar o `Shipment`, não tem como
saber o endereço de entrega (o `PaymentConfirmed` não carrega `addressId`, e a única linha que o
shipping tem por subOrder até ali é a `FreightQuote`). Isso é uma **migration aditiva** num schema já
implementado e mergeado (`docs/STATE.md` marca shipping-db como ✅) — não é só ajuste de doc, precisa
rodar `prisma migrate dev` de novo no shipping-service quando essa fase for implementada.

## Catálogo de eventos (tópicos + payloads)

**Envelope** (contrato do Kafka message value):
```
{ eventId: uuid, eventType, aggregateType, aggregateId, occurredAt, version, payload }
```
A partition key da mensagem é sempre o `aggregateId`.

**Tópicos:** um por serviço publicador — `auth-events`, `catalog-events`, `inventory-events`,
`order-events`, `payment-events`, `shipping-events`. `cart` e `notification` não publicam nada.

### `auth-events`

| Evento | key | payload | consumido por |
|---|---|---|---|
| `UserRegistered` | userId | `{ userId, email, name, role }` | notification (`UserContact`) |
| `UserRoleChanged` | userId | `{ userId, oldRole, newRole }` | — (auditoria) |

### `catalog-events`

| Evento | key | payload | consumido por |
|---|---|---|---|
| `SellerOnboarded` | sellerId | `{ sellerId, userId, storeName, document, mpCollectorId }` | payment (`SellerPaymentProfile`), auth (role → `SELLER`) |
| `ProductCreated` | productId | `{ productId, sellerId, categoryId, title, status }` | — |
| `ProductVariantPriceChanged` | variantId | `{ variantId, productId, oldPrice, newPrice }` | — |

### `order-events`

| Evento | key | payload | consumido por |
|---|---|---|---|
| `OrderCreated` | orderId | `{ orderId, userId, addressId, subOrders: [{ subOrderId, sellerId, items: [{variantId, sku, quantity, weightGrams, heightCm, widthCm, lengthCm}] }] }` | inventory, shipping, notification |
| `OrderReadyForPayment` | orderId | `{ orderId, userId, totalAmount, subOrders: [{subOrderId, sellerId, subtotalAmount, shippingAmount, status}] }` | payment |
| `OrderCancelled` | orderId | `{ orderId, userId, subOrderIds: [...], cancelReason, initiatedBy: "CUSTOMER"\|"SYSTEM" }` | inventory, shipping, notification, payment |

### `inventory-events`

| Evento | key | payload | consumido por |
|---|---|---|---|
| `StockReserved` | subOrderId | `{ subOrderId, orderId, reservations: [{variantId, quantity, reservationId}] }` | order |
| `StockReservationFailed` | subOrderId | `{ subOrderId, orderId, failedItems: [{variantId, requestedQty, availableQty}] }` | order |
| `StockReleased` | subOrderId | `{ subOrderId, releasedItems: [{variantId, quantity}], reason: "PAYMENT_FAILED"\|"ORDER_CANCELLED"\|"EXPIRED" }` | order |

### `shipping-events`

| Evento | key | payload | consumido por |
|---|---|---|---|
| `FreightQuoted` | subOrderId | `{ subOrderId, orderId, carrier, price, estimatedDays }` | order |
| `FreightQuoteFailed` | subOrderId | `{ subOrderId, orderId, reason }` | order |
| `ShipmentDispatched` | subOrderId | `{ subOrderId, orderId, userId, trackingCode, carrier, estimatedDeliveryDate }` | order, notification |
| `ShipmentDelivered` | subOrderId | `{ subOrderId, orderId, userId, deliveredAt }` | order, notification |

### `payment-events`

| Evento | key | payload | consumido por |
|---|---|---|---|
| `PaymentConfirmed` | orderId | `{ paymentId, orderId, userId, method, totalAmount, splits: [{subOrderId, sellerId, amount, platformFeeAmount}] }` | order, inventory, shipping, notification |
| `PaymentFailed` | orderId | `{ paymentId, orderId, userId, method, reason }` | order, inventory, notification |
| `PaymentRefunded` | orderId | `{ paymentId, orderId, userId, refundedAmount, splits: [{subOrderId, sellerId, amount}] }` | order, notification |

### `review-events`

| Evento | key | payload | consumido por |
|---|---|---|---|
| `ReviewSent` | reviewId | `{ reviewId, customerId, productId, sellerId, grade, comment, orderId }` | notification |

## Decisões e desvios registrados

- **`OrderCancelled` agora também é consumido por payment** (não estava no spec original) — dispara
  refund no Mercado Pago se `Payment.status = APPROVED` (idempotente: no-op se não tinha sido pago),
  publica `PaymentRefunded`.
- **`PaymentRefunded` agora é consumido por order** — marca `SubOrder.status = REFUNDED`.
- **shipping deliberadamente não consome `PaymentFailed`** (o spec original também não listava) —
  nada pra limpar antes do `Shipment` existir, que só é criado reagindo a `PaymentConfirmed`.
- **`userId` adicionado a todo evento que dispara notificação** (`PaymentConfirmed`, `PaymentFailed`,
  `PaymentRefunded`, `OrderCancelled`, `ShipmentDispatched`, `ShipmentDelivered`) e a `OrderCreated` —
  sem isso o notification-service não tem como resolver o destinatário do e-mail.
- **`OrderCreated` agora também é consumido por notification** — fecha o uso do
  `NotificationType.ORDER_CREATED`, que já existia no enum sem nada te disparando.
- **Dimensões (`heightCm/widthCm/lengthCm`) adicionadas ao payload de `OrderCreated`** — shipping
  precisa disso pra cotar frete real nos Correios; `OrderItem` no order-db não persiste esse dado
  (só weight), então precisa ir no evento mesmo sem virar coluna.

## Fluxo completo (happy path, atualizado com endpoints)

1. Cliente monta carrinho: `POST /cart/items` (cart-service), com preço/sellerId resolvidos via
   chamada síncrona ao catalog-service.
2. Checkout: `POST /orders` (order-service) — lê carrinho + resnapshota dados do catalog, cria
   `Order`+`SubOrder`+`OrderItem`, limpa carrinho, publica `OrderCreated`.
3. Em paralelo: inventory reserva estoque (`StockReserved`/`StockReservationFailed`) e shipping cota
   frete nos Correios (`FreightQuoted`/`FreightQuoteFailed`), por SubOrder.
4. Order-service agrega as duas respostas por SubOrder; quando todos resolverem, publica
   `OrderReadyForPayment`.
5. Payment-service cria a cobrança no Mercado Pago com split por seller; cliente é redirecionado
   pro `init_point` retornado por `GET /payments/:orderId`. Webhook do MP confirma → publica
   `PaymentConfirmed` (ou `PaymentFailed`).
6. Order-service marca `Order`/`SubOrder` como pagos; inventory confirma baixa de estoque; shipping
   gera o `Shipment` (usando `FreightQuote.addressId`); notification dispara e-mail de confirmação.
7. Se o cliente cancelar um pedido já pago (`POST /orders/:id/cancel`), payment reage a
   `OrderCancelled`, estorna no MP e publica `PaymentRefunded`; order marca `SubOrder.REFUNDED`.
8. Job periódico de rastreio atualiza `Shipment.status` → `ShipmentDispatched`/`ShipmentDelivered`;
   notification avisa o cliente.

## Fora de escopo (YAGNI, deixado pra depois)

- API Gateway / BFF centralizado (Nginx como reverse proxy simples está planejado, ver `docs/STATE.md`
  — não é um gateway de aplicação, só borda de infra).
- Endpoints administrativos (aprovação de seller, suspensão de usuário, painel admin).
- Revogação/blacklist de refresh token.
- Múltiplos canais de notificação (SMS/push) e preferências de usuário.
- Cotação de frete com múltiplas transportadoras (só Correios).
- Cupons/descontos — já fora de escopo no spec de banco anterior, continua valendo aqui. Reviews saíram de escopo: ver `docs/superpowers/specs/2026-07-21-review-purchase-validation-design.md`.
