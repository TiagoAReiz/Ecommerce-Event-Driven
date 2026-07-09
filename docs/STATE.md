# Estado do projeto

Documento vivo — atualizar sempre que uma fase de trabalho for concluída. Diferente de
`docs/superpowers/specs/` e `docs/superpowers/plans/`, que são artefatos congelados de um
momento específico, este arquivo reflete o estado *atual* do projeto.

## Visão geral

Ecommerce event-driven, marketplace multi-seller (estilo Mercado Livre), 8 microservices, cada um
com Postgres próprio, comunicação via Kafka. Ver `docs/superpowers/specs/2026-07-08-microservices-db-schema-design.md`
para o desenho completo do modelo de dados e catálogo de eventos.

## Status por serviço

| Serviço | Schema DB | Migrations | Testes de schema | Kafka producers/consumers | Lógica de negócio | Integrações externas |
|---|---|---|---|---|---|---|
| auth | ✅ | ✅ | ✅ (3) | ⬜ | ⬜ | ⬜ Google OAuth |
| catalog | ✅ | ✅ | ✅ (4) | ⬜ | ⬜ | — |
| cart | ✅ | ✅ | ✅ (2) | — (não consome/publica) | ⬜ | — |
| inventory | ✅ | ✅ | ✅ (3) | ⬜ | ⬜ (reserva/expiração de estoque) | — |
| order | ✅ | ✅ | ✅ (3) | ⬜ | ⬜ (agregação da saga) | — |
| payment | ✅ | ✅ | ✅ (3) | ⬜ | ⬜ (split de pagamento) | ⬜ Mercado Pago |
| shipping | ✅ | ✅ | ✅ (3) | ⬜ | ⬜ | ⬜ Correios (CEP + frete) |
| notification | ✅ | ✅ | ✅ (2) | ⬜ (só consome) | ⬜ (envio de email) | — |

✅ = feito e mergeado em `master` (2026-07-08) · ⬜ = não iniciado

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

Detalhes completos e o porquê de cada decisão: `docs/superpowers/specs/2026-07-08-microservices-db-schema-design.md`.

## Infraestrutura futura planejada (ainda não implementada)

- **Nginx como reverse proxy** na frente de tudo — dos 8 microsserviços e também do front-end
  (Next.js, ainda não iniciado) — para centralizar rate limiting, timeouts e roteamento por
  domínio/path. Não substitui a validação de JWT feita em cada serviço; é só a camada de borda.
  Ainda não há arquivo de config nem serviço no repo — planejar quando a app for pra staging/prod.

## Próximos passos sugeridos

1. Definir e implementar os producers/consumers Kafka de cada serviço (o catálogo de eventos já
   está especificado no spec).
2. Implementar a lógica de negócio: reserva de estoque com expiração, agregação de status da
   saga no order-service, split de pagamento no payment-service.
3. Integrações externas: Google OAuth (auth), Mercado Pago (payment), Correios (shipping).
4. Resolver os débitos técnicos acima junto com o trabalho correspondente (índices junto do
   outbox-relay, por exemplo).
