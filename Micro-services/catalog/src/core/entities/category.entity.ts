export interface CategoryProps {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export class Category {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: CategoryProps) {
    this.id = props.id;
    this.name = props.name;
    this.slug = props.slug;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
