# Desenho dos schemas de banco de dados por microservice

Data: 2026-07-08

## Contexto e escopo

Ecommerce event-driven, marketplace multi-seller estilo Mercado Livre, com 8 microservices já
existentes (esqueleto hexagonal + Kafka já configurados, schemas Prisma vazios): `auth`, `cart`,
`catalog`, `inventory`, `notification`, `order`, `payment`, `shipping`. Cada um com seu próprio
Postgres isolado.

Decisões de negócio que moldam o modelo:
- **Marketplace multi-seller completo**: produtos pertencem a sellers diferentes; um checkout pode
  conter itens de vários sellers ao mesmo tempo.
- **Auth**: somente Google OAuth (sem senha própria). Papéis: `CUSTOMER`, `SELLER`, `ADMIN`.
- **Payment**: Mercado Pago (cartão, Pix, boleto), com split de pagamento entre sellers.
- **Shipping**: integração com Correios — busca de endereço por CEP e cotação real de frete
  (PAC/SEDEX) por peso/dimensão.
- **Saga**: coreografia (cada serviço reage a eventos dos outros), não orquestração central.
- **Estoque**: reserva com expiração (TTL) no início do checkout, confirmada ou liberada depois.
- **Cart**: carrinho anônimo vive só no navegador (localStorage); só é persistido no banco do
  cart-service quando o usuário loga.

## Convenções transversais

- IDs: `String @id @default(uuid())` em toda tabela, exceto quando o ID é uma referência lógica
  compartilhada entre serviços (ex: `Seller.userId`, que aponta pro `User.id` do auth-db sem FK
  cross-database).
- Dinheiro: sempre `Decimal @db.Decimal(12,2)`, nunca float.
- Toda tabela tem `createdAt`/`updatedAt`.
- **Transactional Outbox** em todo serviço que publica evento — grava o evento na mesma transação
  do Postgres que grava a mudança de estado; um poller separado publica no Kafka e marca como
  enviado:
  ```prisma
  model OutboxEvent {
    id            String   @id @default(uuid())
    aggregateType String
    aggregateId   String
    eventType     String
    payload       Json
    status        OutboxStatus @default(PENDING)
    createdAt     DateTime @default(now())
    updatedAt     DateTime @updatedAt
    publishedAt   DateTime?
  }
  enum OutboxStatus { PENDING PUBLISHED FAILED }
  ```
- **Inbox / idempotência de consumo** em todo serviço que consome evento — evita reprocessar o
  mesmo evento em reentregas do Kafka:
  ```prisma
  model ProcessedEvent {
    id          String   @id @default(uuid())
    eventId     String   @unique
    eventType   String
    processedAt DateTime @default(now())
  }
  ```
  `processedAt` é uma exceção deliberada à convenção `createdAt`/`updatedAt`: a linha é criada uma
  vez e nunca mutada, então um nome que descreve o que aconteceu é mais claro que um `createdAt`
  genérico, e não precisa de `updatedAt`.
- Envelope de evento (contrato, não é tabela): `{ eventId: uuid, eventType, occurredAt, version, payload }`.

Nem todo serviço precisa das duas tabelas: cart não publica nem consome eventos de domínio
(checkout é lido via API síncrona pelo order-service); catalog só publica (sem Inbox por ora);
notification só consome (sem Outbox).

## auth-db

```prisma
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
enum Role { CUSTOMER SELLER ADMIN }
```

Sem senha, sem tabela extra — só o perfil vindo do Google + role. `OutboxEvent` publica
`UserRegistered` e `UserRoleChanged`. Sem `ProcessedEvent` (auth não consome eventos de outros
serviços).

## catalog-db

```prisma
model Seller {
  id            String   @id @default(uuid())
  userId        String   @unique   // referência lógica ao User.id do auth-db
  storeName     String
  slug          String   @unique
  document      String              // CPF/CNPJ
  mpCollectorId String              // conta Mercado Pago do seller, usada no split do pagamento
  status        SellerStatus @default(PENDING)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  products      Product[]
}
enum SellerStatus { PENDING ACTIVE SUSPENDED }

model Category {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  products  Product[]
}

model Product {
  id          String   @id @default(uuid())
  sellerId    String
  seller      Seller   @relation(fields: [sellerId], references: [id])
  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id])
  title       String
  description String
  status      ProductStatus @default(ACTIVE)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  variants    ProductVariant[]
}
enum ProductStatus { ACTIVE PAUSED DELETED }

model ProductVariant {
  id          String   @id @default(uuid())
  productId   String
  product     Product  @relation(fields: [productId], references: [id])
  sku         String   @unique
  attributes  Json                    // ex: { "size": "P", "color": "Azul" }
  price       Decimal  @db.Decimal(12,2)
  weightGrams Int                     // necessário pra cotação de frete nos Correios
  heightCm    Int
  widthCm     Int
  lengthCm    Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

Notas:
- `Seller.id` é gerado normalmente (uuid), independente do `User.id` do auth — a ligação é via
  `Seller.userId`. Onboarding de seller é um endpoint próprio do catalog-service, validado pela
  role `SELLER` no token JWT.
- Peso/dimensões ficam na `ProductVariant` porque é o dado que o shipping-service precisa pra
  cotar frete real nos Correios.
- `OutboxEvent` publica `ProductCreated`, `ProductVariantPriceChanged`, `SellerOnboarded`. Sem
  `ProcessedEvent` por ora (catalog não consome eventos de outros serviços).

## cart-db

```prisma
model Cart {
  id        String   @id @default(uuid())
  userId    String   @unique   // 1 carrinho ativo por usuário logado (guest fica só no navegador)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  items     CartItem[]
}

model CartItem {
  id                String   @id @default(uuid())
  cartId            String
  cart              Cart     @relation(fields: [cartId], references: [id])
  variantId         String            // referência lógica ao ProductVariant do catalog-db
  sellerId          String            // denormalizado do variant, evita join cross-db pra agrupar por seller na UI
  quantity          Int
  unitPriceSnapshot Decimal  @db.Decimal(12,2)  // só exibição ("preço mudou desde que você add"), não é fonte de verdade
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([cartId, variantId])
}
```

Sem `OutboxEvent`/`ProcessedEvent`. O checkout é o order-service chamando a API do cart-service
pra ler os itens e depois limpar o carrinho; o preço definitivo é resnapshotado no `OrderItem` no
momento da criação do pedido.

## inventory-db

```prisma
model StockItem {
  id          String   @id @default(uuid())
  variantId   String   @unique   // referência lógica ao ProductVariant
  sellerId    String
  quantity    Int      @default(0)   // estoque físico total
  reservedQty Int      @default(0)   // quantidade travada em reservas ativas
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model StockReservation {
  id         String   @id @default(uuid())
  variantId  String
  subOrderId String            // referência lógica ao SubOrder
  quantity   Int
  status     ReservationStatus @default(PENDING)
  expiresAt  DateTime          // TTL — ex: now() + 15min
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
enum ReservationStatus { PENDING CONFIRMED RELEASED EXPIRED }
```

Disponível pra venda = `quantity - reservedQty`, calculado na hora — evitamos um terceiro contador
`availableQty` porque criaria dois números que precisam ficar sincronizados manualmente sob
concorrência.

Fluxo: `OrderCreated` → cria `StockReservation(PENDING)` por item, soma em `reservedQty`, publica
`StockReserved` ou `StockReservationFailed`. `PaymentConfirmed` → reservation vira `CONFIRMED`,
debita `quantity` e `reservedQty` de fato. `PaymentFailed`/`OrderCancelled`/expiração →
`RELEASED`/`EXPIRED`, devolve só `reservedQty` e publica `StockReleased`. A expiração é um job
periódico varrendo `PENDING` com `expiresAt < now()` — não é uma tabela nova.

`OutboxEvent` publica `StockReserved`/`StockReservationFailed`/`StockReleased`. `ProcessedEvent`
consome `OrderCreated`, `PaymentConfirmed`, `PaymentFailed`, `OrderCancelled`.

## order-db

```prisma
model Order {
  id          String   @id @default(uuid())
  userId      String
  addressId   String              // referência lógica ao Address do shipping-db
  status      OrderStatus @default(PENDING)
  totalAmount Decimal  @db.Decimal(12,2)   // recalculado quando todos os subOrders resolvem estoque+frete
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  subOrders   SubOrder[]
}
enum OrderStatus {
  PENDING             // esperando estoque+frete de todos os subOrders
  READY_FOR_PAYMENT
  AWAITING_PAYMENT
  PAID
  PARTIALLY_FULFILLED // alguns subOrders cancelados (sem estoque/frete), resto seguiu
  COMPLETED
  CANCELLED           // todos os subOrders cancelados
}

model SubOrder {
  id              String   @id @default(uuid())
  orderId         String
  order           Order    @relation(fields: [orderId], references: [id])
  sellerId        String
  status          SubOrderStatus @default(PENDING)
  subtotalAmount  Decimal  @db.Decimal(12,2)
  shippingAmount  Decimal? @db.Decimal(12,2)   // setado quando FreightQuoted chega
  stockReservedAt DateTime?                    // marca chegada de StockReserved
  freightQuotedAt DateTime?                    // marca chegada de FreightQuoted
  cancelReason    String?                      // "OUT_OF_STOCK" | "FREIGHT_UNAVAILABLE" | "PAYMENT_FAILED"
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  items           OrderItem[]
}
enum SubOrderStatus {
  PENDING
  READY              // stockReservedAt E freightQuotedAt preenchidos
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
  unitPriceSnapshot   Decimal  @db.Decimal(12,2)
  quantity            Int
  weightGramsSnapshot Int
  createdAt           DateTime @default(now())
}
```

`stockReservedAt`/`freightQuotedAt` são dois marcadores independentes (em vez de um único enum)
porque são pré-condições que chegam em paralelo, em ordem incerta, e precisam das duas presentes
antes do subOrder virar `READY`.

**Por que existe o passo extra `OrderReadyForPayment`:** o frete (cotado nos Correios) e o
resultado da reserva de estoque só ficam prontos depois que `OrderCreated` é publicado, mas o
Mercado Pago precisa do valor final (produtos + frete, menos itens sem estoque) antes de cobrar o
cliente. Order-service escuta `StockReserved`/`StockReservationFailed` e
`FreightQuoted`/`FreightQuoteFailed`; quando todos os SubOrders resolvem as duas coisas, recalcula
`totalAmount` e publica `OrderReadyForPayment`. Continua sendo coreografia — order-service só reage
a eventos dos próprios filhos, não manda comando pra inventory/shipping agirem.

`OutboxEvent` publica `OrderCreated`, `OrderReadyForPayment`, `OrderCancelled`. `ProcessedEvent`
consome `StockReserved`, `StockReservationFailed`, `StockReleased`, `FreightQuoted`,
`FreightQuoteFailed`, `PaymentConfirmed`, `PaymentFailed`, `ShipmentDispatched`,
`ShipmentDelivered`.

## payment-db

```prisma
model Payment {
  id             String   @id @default(uuid())
  orderId        String
  userId         String
  method         PaymentMethod
  status         PaymentStatus @default(PENDING)
  totalAmount    Decimal  @db.Decimal(12,2)
  mpPaymentId    String?  @unique
  mpPreferenceId String?  @unique
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  splits         PaymentSplit[]
}
enum PaymentMethod { CREDIT_CARD PIX BOLETO }
enum PaymentStatus { PENDING APPROVED REJECTED EXPIRED REFUNDED }

model PaymentSplit {
  id                String   @id @default(uuid())
  paymentId         String
  payment           Payment  @relation(fields: [paymentId], references: [id])
  subOrderId        String
  sellerId          String
  mpCollectorId     String
  amount            Decimal  @db.Decimal(12,2)
  platformFeeAmount Decimal  @db.Decimal(12,2)
  status            PaymentSplitStatus @default(PENDING)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
enum PaymentSplitStatus { PENDING SETTLED FAILED }

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
```

`MpWebhookEvent` é separado do `ProcessedEvent` genérico porque é outro transporte (webhook HTTP do
Mercado Pago, não mensagem Kafka) — deduplicação pelo `mpEventId` que o próprio MP envia.

`SellerPaymentProfile` é um read-model local: payment-service precisa do `mpCollectorId` de cada
seller pra montar o split, e não deve chamar o catalog-service de forma síncrona no meio do
checkout (acoplaria os dois serviços em tempo de execução). Em vez disso, mantém uma cópia local
atualizada consumindo o evento `SellerOnboarded` do catalog.

`OutboxEvent` publica `PaymentConfirmed`, `PaymentFailed`, `PaymentRefunded`. `ProcessedEvent`
consome `OrderReadyForPayment` e `SellerOnboarded`.

## shipping-db

```prisma
model Address {
  id           String   @id @default(uuid())
  ownerType    AddressOwnerType
  ownerId      String              // userId ou sellerId (referência lógica, sem FK cross-db)
  cep          String
  street       String
  number       String
  complement   String?
  neighborhood String
  city         String
  state        String
  country      String   @default("BR")
  isDefault    Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
enum AddressOwnerType { CUSTOMER SELLER }

model FreightQuote {
  id             String   @id @default(uuid())
  subOrderId     String   @unique   // uma cotação vencedora por subOrder
  originCep      String            // CEP do seller
  destinationCep String            // CEP do endereço de entrega
  carrier        String            // "PAC" | "SEDEX"
  price          Decimal  @db.Decimal(12,2)
  estimatedDays  Int
  requestedAt    DateTime @default(now())
}

model Shipment {
  id                    String   @id @default(uuid())
  subOrderId            String   @unique
  addressId             String
  address               Address  @relation(fields: [addressId], references: [id])
  carrier               String
  trackingCode          String?
  status                ShipmentStatus @default(LABEL_PENDING)
  estimatedDeliveryDate DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}
enum ShipmentStatus { LABEL_PENDING LABEL_CREATED POSTED IN_TRANSIT DELIVERED RETURNED }
```

`FreightQuote` guarda a cotação vencedora usada pra fechar `SubOrder.shippingAmount` — quando o
`Shipment` é gerado de fato (após `PaymentConfirmed`), reaproveita o mesmo preço/prazo já cobrado
do cliente em vez de cotar de novo. Rastreamento (`IN_TRANSIT`/`DELIVERED`) é um job periódico
consultando a API de rastreio dos Correios pelo `trackingCode` (Correios não oferece webhook) —
não precisa de tabela extra.

`OutboxEvent` publica `FreightQuoted`, `FreightQuoteFailed`, `ShipmentDispatched`,
`ShipmentDelivered`. `ProcessedEvent` consome `OrderCreated`, `PaymentConfirmed`,
`OrderCancelled`.

## notification-db

```prisma
model NotificationLog {
  id             String   @id @default(uuid())
  userId         String
  type           NotificationType
  recipientEmail String
  subject        String
  status         NotificationStatus @default(PENDING)
  sentAt         DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
enum NotificationType {
  ORDER_CREATED
  PAYMENT_CONFIRMED
  PAYMENT_FAILED
  SHIPMENT_DISPATCHED
  SHIPMENT_DELIVERED
  ORDER_CANCELLED
}
enum NotificationStatus { PENDING SENT FAILED }
```

Só canal email no MVP. Só `ProcessedEvent` (Inbox) — notification consome praticamente todo evento
importante do sistema pra disparar email, mas não publica nada que outro serviço precise, então
sem `OutboxEvent`.

## Catálogo de eventos (ponta a ponta)

| Evento | Publicado por | Consumido por |
|---|---|---|
| `UserRegistered`, `UserRoleChanged` | auth | — (auditoria por ora) |
| `SellerOnboarded` | catalog | payment (`SellerPaymentProfile`) |
| `ProductCreated`, `ProductVariantPriceChanged` | catalog | — |
| `OrderCreated` | order | inventory, shipping |
| `StockReserved`, `StockReservationFailed`, `StockReleased` | inventory | order |
| `FreightQuoted`, `FreightQuoteFailed` | shipping | order |
| `OrderReadyForPayment` | order | payment |
| `PaymentConfirmed`, `PaymentFailed` | payment | order, inventory, shipping, notification |
| `OrderCancelled` | order | inventory, shipping, notification |
| `ShipmentDispatched`, `ShipmentDelivered` | shipping | order, notification |

## Fluxo completo (happy path)

1. Cliente monta carrinho (guest no navegador; persiste em `cart-db` ao logar com Google).
2. Checkout: order-service lê o carrinho, cria `Order` + `SubOrder` (1 por seller) + `OrderItem`
   (com snapshot de preço/peso), publica `OrderCreated`.
3. Em paralelo: inventory reserva estoque (`StockReserved`/`StockReservationFailed`) e shipping
   cota frete nos Correios (`FreightQuoted`/`FreightQuoteFailed`), por SubOrder.
4. Order-service agrega as duas respostas por SubOrder; quando todos resolverem, recalcula o total
   e publica `OrderReadyForPayment`.
5. Payment-service cria a cobrança no Mercado Pago (cartão/Pix/boleto) com split por seller
   (usando `SellerPaymentProfile`); webhook do MP confirma e publica `PaymentConfirmed` (ou
   `PaymentFailed`).
6. Order-service marca `Order`/`SubOrder` como pagos; inventory confirma a baixa definitiva de
   estoque; shipping gera a etiqueta/postagem (`Shipment`) reaproveitando a `FreightQuote`; notification
   dispara email.
7. Job periódico de rastreio atualiza `Shipment.status` → `ShipmentDispatched`/`ShipmentDelivered`;
   order-service atualiza o `SubOrder` correspondente; notification avisa o cliente.

## Fora de escopo (YAGNI, deixado pra depois)

- Reviews/avaliações de produto ou seller.
- Múltiplos canais de notificação (SMS/push) e preferências de usuário.
- Categorias hierárquicas (árvore).
- Cotação de frete com múltiplas transportadoras (só Correios por ora).
- Cupons/descontos no carrinho ou pedido.
