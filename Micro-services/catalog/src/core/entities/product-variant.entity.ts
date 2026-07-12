export interface ProductVariantProps {
  id: string;
  productId: string;
  sku: string;
  attributes: Record<string, unknown>;
  price: number;
  weightGrams: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  createdAt: Date;
  updatedAt: Date;
}

export class ProductVariant {
  readonly id: string;
  readonly productId: string;
  readonly sku: string;
  readonly attributes: Record<string, unknown>;
  readonly price: number;
  readonly weightGrams: number;
  readonly heightCm: number;
  readonly widthCm: number;
  readonly lengthCm: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: ProductVariantProps) {
    this.id = props.id;
    this.productId = props.productId;
    this.sku = props.sku;
    this.attributes = props.attributes;
    this.price = props.price;
    this.weightGrams = props.weightGrams;
    this.heightCm = props.heightCm;
    this.widthCm = props.widthCm;
    this.lengthCm = props.lengthCm;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
