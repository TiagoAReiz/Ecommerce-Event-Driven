import { DomainException } from './domain.exception';

// Lançada quando um caller sem role SELLER tenta criar/editar/apagar um endereço `ownerType=SELLER`.
// (Ver o trust-gap documentado no address.service.ts sobre não conseguirmos amarrar sellerId ao
// userId do JWT sem um read-model de catalog — fora do escopo deste serviço.)
export class SellerAddressForbiddenException extends DomainException {
  constructor() {
    super('Only sellers can manage seller-owned addresses');
  }
}
