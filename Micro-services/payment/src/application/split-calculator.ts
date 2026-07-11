// -------------------------------------------------------------------------------------------------
// Cálculo do split (repasse por seller). O spec não fixa a taxa da plataforma, então adotamos uma
// constante única aqui. Invariante que precisa fechar: para cada subOrder,
//     amount + platformFeeAmount === subtotalAmount + shippingAmount
// e somando todos os subOrders o total bate com o `totalAmount` do OrderReadyForPayment (assumindo
// que o order-service manda totalAmount = Σ(subtotal + shipping)).
//
// A taxa incide só sobre o SUBTOTAL (mercadoria), não sobre o frete — o frete é repassado integral ao
// seller. Toda a matemática é feita em CENTAVOS INTEIROS pra não ter drift de ponto flutuante; a
// conversão pra string fixed-2 (convenção MONEY) acontece só na saída.
// -------------------------------------------------------------------------------------------------

/** Taxa da plataforma sobre o subtotal (10%). Ponto único de mudança. */
export const PLATFORM_FEE_RATE = 0.1;

function toCents(fixed2: string): number {
  return Math.round(Number(fixed2) * 100);
}

function centsToFixed2(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface SplitAmounts {
  amount: string; // repasse ao seller (subtotal + frete − taxa)
  platformFeeAmount: string; // taxa retida pela plataforma
}

export function computeSplit(subtotalAmount: string, shippingAmount: string): SplitAmounts {
  const subtotalCents = toCents(subtotalAmount);
  const shippingCents = toCents(shippingAmount);
  const feeCents = Math.round(PLATFORM_FEE_RATE * subtotalCents);
  const amountCents = subtotalCents + shippingCents - feeCents;
  return {
    amount: centsToFixed2(amountCents),
    platformFeeAmount: centsToFixed2(feeCents),
  };
}
