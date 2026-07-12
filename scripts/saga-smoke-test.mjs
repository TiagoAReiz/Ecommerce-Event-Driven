// Cross-service saga smoke test (happy path) for the event-driven marketplace.
//
// Drives the full choreography against LIVE services (host-run on ports 3002-3008) + the
// docker-compose Kafka/Postgres. No test framework — plain Node (built-in fetch + crypto).
//
//   Prereqs (see scripts/README-saga.md for exact setup commands): docker infra up; the 6
//   services running on their ports (catalog:3003 cart:3002 inventory:3004 order:3006
//   payment:3007 shipping:3008); the 6 Kafka topics PRE-CREATED (consumers stall on a
//   not-yet-produced topic); a category seeded in catalog-db (seed-only, no API).
//
//   Flow: onboard seller -> product+variant -> stock -> address -> cart -> POST /orders
//         -> [OrderCreated -> StockReserved + FreightQuoted -> OrderReadyForPayment]
//         -> payment preference created -> webhook(approved) -> PaymentConfirmed
//         -> assert Order PAID / SubOrder PAYMENT_CONFIRMED.
//
//   Exit 0 = saga completed; non-zero = a step or assertion failed (with context).

import { createHmac, randomUUID } from 'node:crypto';

const JWT_SECRET = 'dev-access-secret-change-me';
const MP_WEBHOOK_SECRET = 'dev-mp-webhook-secret-change-me';

const CATALOG = 'http://localhost:3003/api/v1';
const CART = 'http://localhost:3002/api/v1';
const INVENTORY = 'http://localhost:3004/api/v1';
const ORDER = 'http://localhost:3006/api/v1';
const PAYMENT = 'http://localhost:3007/api/v1';
const SHIPPING = 'http://localhost:3008/api/v1';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function mintJwt(sub, email, role) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ sub, email, role, iat: now, exp: now + 3600 }));
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

async function http(method, url, { token, body, rawBody, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (rawBody !== undefined) {
    h['content-type'] = 'application/json';
    payload = rawBody;
  } else if (body !== undefined) {
    h['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers: h, body: payload });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${url} -> ${res.status}: ${text}`);
  }
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollUntil(label, fn, { timeoutMs = 30000, intervalMs = 1000 } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (last.done) return last.value;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for: ${label} (last seen: ${JSON.stringify(last?.value)})`);
}

const log = (...a) => console.log('•', ...a);

async function main() {
  // Two actors: a SELLER (onboards + owns product/stock/origin-address) and a CUSTOMER (buys).
  // shipping gates ownerType=SELLER addresses on the JWT role claim, so they must be distinct.
  const sellerUserId = randomUUID();
  const sellerToken = mintJwt(sellerUserId, `seller-${sellerUserId.slice(0, 8)}@example.com`, 'SELLER');
  const customerUserId = randomUUID();
  const customerToken = mintJwt(customerUserId, `buyer-${customerUserId.slice(0, 8)}@example.com`, 'CUSTOMER');
  log('sellerUser', sellerUserId, '| customerUser', customerUserId);

  // 0) category (seed-only) — reuse the first existing one
  const categories = await http('GET', `${CATALOG}/categories`);
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error('No category seeded in catalog-db — seed one before running.');
  }
  const categoryId = categories[0].id;

  // 1) seller onboarding
  const seller = await http('POST', `${CATALOG}/sellers`, {
    token: sellerToken,
    body: {
      storeName: 'Loja Saga',
      // documento único por execução (unique no catalog) — evita 409 em re-runs
      document: String(Date.now()).padStart(14, '9').slice(-14),
      mpCollectorId: `mp-${sellerUserId.slice(0, 8)}`,
    },
  });
  log('seller', seller.id);

  // 1b) seller ORIGIN address — obrigatório pra cotação de frete (senão FreightQuoteFailed ->
  // saga cancela). Spec: "cotação de frete depende do seller ter um Address(ownerType=SELLER)".
  const originAddress = await http('POST', `${SHIPPING}/addresses`, {
    token: sellerToken,
    body: { ownerType: 'SELLER', ownerId: seller.id, cep: '04538133', street: 'Av Faria Lima', number: '3477', neighborhood: 'Itaim Bibi', city: 'São Paulo', state: 'SP', country: 'BR' },
  });
  log('seller origin address', originAddress.id);

  // 2) product + 3) variant
  const product = await http('POST', `${CATALOG}/products`, {
    token: sellerToken,
    body: { categoryId, title: 'Fone Saga', description: 'Fone de teste da saga' },
  });
  const variant = await http('POST', `${CATALOG}/products/${product.id}/variants`, {
    token: sellerToken,
    body: { sku: `SKU-${sellerUserId.slice(0, 8)}`, attributes: { color: 'Preto' }, price: 199.9, weightGrams: 300, heightCm: 5, widthCm: 12, lengthCm: 18 },
  });
  log('variant', variant.id, 'price', variant.price);

  // 4) stock
  await http('POST', `${INVENTORY}/stock`, { token: sellerToken, body: { variantId: variant.id, quantity: 100 } });
  log('stock initialized: 100');

  // 5) delivery address
  const address = await http('POST', `${SHIPPING}/addresses`, {
    token: customerToken,
    body: { ownerType: 'CUSTOMER', cep: '01310100', street: 'Av Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP', country: 'BR' },
  });
  log('address', address.id);

  // 6) cart
  await http('POST', `${CART}/cart/items`, { token: customerToken, body: { variantId: variant.id, quantity: 2 } });
  log('cart: 2 x variant');

  // 7) checkout
  const order = await http('POST', `${ORDER}/orders`, {
    token: customerToken,
    headers: { 'idempotency-key': randomUUID() },
    body: { addressId: address.id },
  });
  log('order', order.id, 'status', order.status);

  // 8) wait for saga: stock reserved + freight quoted -> Order READY_FOR_PAYMENT
  const ready = await pollUntil(
    'Order READY_FOR_PAYMENT (stock reserved + freight quoted)',
    async () => {
      const o = await http('GET', `${ORDER}/orders/${order.id}`, { token: customerToken });
      const subStatuses = (o.subOrders ?? []).map((s) => s.status);
      const value = { orderStatus: o.status, subStatuses };
      const done = o.status === 'READY_FOR_PAYMENT' || o.status === 'AWAITING_PAYMENT' || subStatuses.every((s) => s === 'READY');
      return { done, value };
    },
  );
  log('saga reached ready-for-payment', JSON.stringify(ready));

  // 9) payment preference created reactively
  const payment = await pollUntil('Payment created for order', async () => {
    try {
      const p = await http('GET', `${PAYMENT}/payments/${order.id}`, { token: customerToken });
      return { done: true, value: p };
    } catch (e) {
      return { done: false, value: String(e.message).slice(0, 80) };
    }
  });
  log('payment', payment.paymentId ?? payment.id ?? '(created)', 'status', payment.status);

  // 10) MP webhook (approved) — HMAC-signed raw body
  const webhookBody = JSON.stringify({
    id: `mpevt-${randomUUID()}`,
    type: 'payment',
    action: 'payment.updated',
    data: { id: `mp-${randomUUID()}` },
    orderId: order.id,
    status: 'approved',
    method: 'PIX',
  });
  const signature = createHmac('sha256', MP_WEBHOOK_SECRET).update(webhookBody).digest('hex');
  const webhookRes = await http('POST', `${PAYMENT}/payments/webhook/mercadopago`, {
    rawBody: webhookBody,
    headers: { 'x-signature': signature },
  });
  log('webhook ->', JSON.stringify(webhookRes));

  // 11) wait for PaymentConfirmed to propagate -> Order PAID / SubOrder PAYMENT_CONFIRMED
  const paid = await pollUntil('Order PAID after PaymentConfirmed', async () => {
    const o = await http('GET', `${ORDER}/orders/${order.id}`, { token: customerToken });
    const subStatuses = (o.subOrders ?? []).map((s) => s.status);
    const value = { orderStatus: o.status, subStatuses };
    const done =
      o.status === 'PAID' ||
      o.status === 'COMPLETED' ||
      o.status === 'PARTIALLY_FULFILLED' ||
      subStatuses.some((s) => ['PAYMENT_CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(s));
    return { done, value };
  });
  log('saga reached paid state', JSON.stringify(paid));

  console.log('\n✅ SAGA HAPPY PATH COMPLETED');
  console.log(`   order=${order.id} finalOrderStatus=${paid.orderStatus} subOrders=${JSON.stringify(paid.subStatuses)}`);
}

main().catch((e) => {
  console.error('\n❌ SAGA SMOKE TEST FAILED:\n', e.message);
  process.exit(1);
});
