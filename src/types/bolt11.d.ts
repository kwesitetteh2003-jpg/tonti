declare module "bolt11" {
  export type Tag = { tagName: string; data: unknown };
  export type PaymentRequestObject = {
    paymentRequest?: string;
    prefix?: string;
    satoshis?: number | null;
    millisatoshis?: string | null;
    timestamp?: number;
    tags?: Tag[];
  };
  export function encode(input: {
    network: unknown;
    satoshis?: number;
    timestamp?: number;
    tags: Tag[];
  }): PaymentRequestObject;
  export function sign(input: PaymentRequestObject, privateKey: string): PaymentRequestObject;
  export function decode(paymentRequest: string): PaymentRequestObject;
  const bolt11: { encode: typeof encode; sign: typeof sign; decode: typeof decode };
  export default bolt11;
}
