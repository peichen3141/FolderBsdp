declare module "bsdp" {
  export function diff(a: string, b: string, c: string): any;
  export function patch(a: string, b: string, c: string): any;
}

declare module "walker" {
  export default function (a: string): this;
}
