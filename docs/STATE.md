# Estado do projeto

Documento vivo — atualizar sempre que uma fase de trabalho for concluída. Diferente de
`docs/superpowers/specs/` e `docs/superpowers/plans/`, que são artefatos congelados de um
momento específico, este arquivo reflete o estado *atual* do projeto.

## Visão geral

Ecommerce event-driven, marketplace multi-seller (estilo Mercado Livre), 8 microservices, cada um
com Postgres próprio, comunicação via Kafka. Ver `docs/superpowers/specs/2026-07-08-microservices-db-schema-design.md`
para o desenho completo do modelo de dados e catálogo de eventos.

## Status por serviço

| Serviço | Schema DB | Migrations | Kafka producers/consumers | Lógica de negócio | Integrações externas |
|---|---|---|---|---|---|
| auth | ✅ | ✅ | 🟡 produtor (falta consumer `SellerOnboarded`) | ✅ login + JWT | ✅ Google OAuth |
| catalog | ✅ | ✅ | ✅ produtor (`catalog-events`) | ✅ produtos/variants/seller onboarding | — |
| cart | ✅ | ✅ | — (só API síncrona) | ✅ carrinho + chamada síncrona ao catalog | — |
| inventory | ✅ | ✅ | ✅ consumer + produtor | ✅ reserva com TTL + expiração | — (chama catalog p/ ownership) |
| order | ✅ | ✅ | ✅ consumer + produtor | ✅ integrador da saga (agregação exactly-once) | — (chama cart/catalog no checkout) |
| payment | ✅ | ✅ | ✅ consumer + produtor | ✅ split de pagamento | 🟡 Mercado Pago (STUB) |
| shipping | ✅ | ✅ | ✅ consumer + produtor | ✅ cotação/envio/tracking | 🟡 Correios (STUB) |
| notification | ✅ | ✅ | ✅ só consome | ✅ envio de email (stub) | 🟡 email/SMTP (STUB) |

✅ = feito e mergeado/na branch `feat/services-implementation` · 🟡 = parcial (ver notas) · STUB =
port de serviço externo implementado com fake determinístico (integração real é fase posterior)

Os 7 serviços não-auth foram implementados em 2026-07-11 seguindo a estrutura hexagonal padronizada,
cada um com seus endpoints REST, producers/consumers Kafka (Transactional Outbox + Inbox
`ProcessedEvent` pra idempotência), e testes (unit + e2e, todos verdes, rodados serviço a serviço).
Integrações externas reais (Mercado Pago, Correios, SMTP) ficaram atrás de ports com stubs.

🟡 **auth**: o outbox relay publica em `auth-events` (`UserRegistered`, `UserRoleChanged`), mas auth
ainda **não consome** `SellerOnboarded` do catalog (pra promover `User.role` a `SELLER`). É o próximo
passo pra fechar o fluxo de seller onboarding de ponta a ponta.

## Débitos técnicos / follow-ups conhecidos

- [ ] **Índices em colunas de FK/lookup** — nenhum serviço tem `@@index` em colunas de FK (ex:
      `Product.sellerId`, `OrderItem.subOrderId`, `PaymentSplit.paymentId` etc.) nem em
      `OutboxEvent.status` (que o futuro relay vai fazer `WHERE status = 'PENDING'` o tempo todo).
      Não bloqueia agora (sem dado/tráfego), mas deve entrar junto com a implementação do
      outbox-relay e das queries de saga.
- [ ] **Testes de constraint única não checam o código do erro** — vários testes só fazem
      `.rejects.toThrow()` sem verificar que é especificamente `P2002` (violação de unique) do
      Prisma. Passariam com qualquer erro. Baixo risco, mas vale reforçar quando mexer nesses
      arquivos de novo.
- [ ] **3 serviços têm migration de "fix-up" em vez de init limpo** (auth, catalog, payment) —
      cosmético, sem efeito funcional, já que nenhum desses bancos foi implantado de verdade ainda.

## Decisões de arquitetura (referência rápida)

- **Marketplace multi-seller completo**: produtos pertencem a sellers diferentes; um checkout pode
  virar vários `SubOrder` (um por seller) dentro de uma `Order` guarda-chuva.
- **Auth**: só Google OAuth, sem senha. Roles: `CUSTOMER`, `SELLER`, `ADMIN`.
- **Payment**: Mercado Pago (cartão/Pix/boleto) com split de pagamento por seller.
- **Shipping**: Correios pra CEP→endereço E cotação real de frete (PAC/SEDEX) — não é tabela fixa.
- **Saga**: coreografia (order-service reage a eventos, não manda comando pros outros serviços).
- **Estoque**: reserva com TTL no início do checkout, confirmada ou liberada depois.
- **Cart**: carrinho anônimo só no navegador; cart-service só persiste carrinho de usuário logado.
- **API**: sem API Gateway — front-end chama cada um dos 8 serviços diretamente. Auth via JWT
  stateless assinado pelo auth-service, validado localmente em cada serviço (sem round-trip
  síncrono pro auth-service).
- **Estrutura de pastas hexagonal padronizada** (definida e aplicada no auth em 2026-07-10):
  `core/{entities,exceptions,interfaces/{services,external,repositories}}` (puro, Symbols de DI),
  `application/{services,mappers}` (lógica de negócio), `adapters/in/{controllers/guards,filters,dtos}`,
  `adapters/out/{repositories,external,database,messaging}`. Exception filter global traduz exceção
  de domínio → HTTP. Os outros 7 serviços adotam a convenção quando forem implementados. Ver
  `docs/superpowers/specs/2026-07-10-hexagonal-folder-structure-design.md`.

Detalhes completos e o porquê de cada decisão: `docs/superpowers/specs/2026-07-08-microservices-db-schema-design.md`.

## Infraestrutura futura planejada (ainda não implementada)

- **Nginx como reverse proxy** na frente de tudo — dos 8 microsserviços e também do front-end
  (Next.js, ainda não iniciado) — para centralizar rate limiting, timeouts e roteamento por
  domínio/path. Não substitui a validação de JWT feita em cada serviço; é só a camada de borda.
  Ainda não há arquivo de config nem serviço no repo — planejar quando a app for pra staging/prod.

## Próximos passos sugeridos

1. **auth consumer de `SellerOnboarded`** — promover `User.role` a `SELLER` e publicar
   `UserRoleChanged`; fecha o fluxo de seller onboarding de ponta a ponta (auth ainda não tem
   consumer nenhum; precisa adicionar `ProcessedEvent` ao schema do auth).
2. **Teste de integração cross-service da saga** — happy path real ponta a ponta contra o
   docker-compose (OrderCreated → StockReserved+FreightQuoted → OrderReadyForPayment →
   PaymentConfirmed → Shipment). Nenhum agente isolado testou as costuras entre serviços.
3. **Substituir os stubs por integrações reais**: Mercado Pago (payment), Correios (shipping),
   SMTP/provedor de email (notification). Os ports já existem; é trocar a implementação.
4. **Débitos técnicos**: DTOs públicos de product/variant do catalog ainda serializam preço como
   `Number` (float) em vez de string fixed-2 (sem consumidor ainda); `order-db` teve o tracking de
   migrations reconciliado via `db push` (migration file escrito à mão); índices em colunas de FK
   ainda pendentes na maioria dos serviços.
