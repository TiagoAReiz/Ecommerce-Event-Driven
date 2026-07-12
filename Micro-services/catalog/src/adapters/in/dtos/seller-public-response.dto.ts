// Vitrine pública: sem `document` (CPF/CNPJ) nem `mpCollectorId` (dado interno de repasse).
export class SellerPublicResponseDto {
  id!: string;
  storeName!: string;
  slug!: string;
  status!: string;
  createdAt!: Date;
}
