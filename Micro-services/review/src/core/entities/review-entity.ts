export interface ReviewProps {
    id: string;
    grade: number;
    comment: string;
    createdAt: Date;
    updatedAt: Date;
    customerId: string;
    orderId: string;
    productId: string;

}
export class Review {
    readonly id: string
    readonly grade: number;
    readonly comment: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly customerId: string;
    readonly orderId: string;
    readonly productId: string;


    constructor(props: ReviewProps) {
        this.id = props.id;
        this.grade = props.grade;
        this.comment = props.comment;
        this.createdAt = props.createdAt;
        this.updatedAt = props.updatedAt;
        this.customerId = props.customerId;
        this.orderId = props.orderId;
        this.productId = props.productId;

    }
}