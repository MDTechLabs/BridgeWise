
export interface Asset {
  id: string;
  code: string;
  issuer: string;
}

export interface Registry {
  assets: Asset[];
}