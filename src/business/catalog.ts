export interface ProfileView {
  businessName: string;
  address: string | null;
  openingHours: string | null;
  paymentMethods: string[];
  services: string[];
}

export interface OfferView {
  sku: string;
  brand: string;
  name: string;
  viscosity: string | null;
  specifications: string[];
  unit: string;
  priceCents: number;
  validFrom: Date;
}

export interface CommercialCatalogReader {
  getProfile(): Promise<ProfileView | null>;
  findCurrentOffers(query: string): Promise<OfferView[]>;
}

export interface CatalogQueryPort {
  findProfile(): Promise<ProfileView | null>;
  findOffers(normalizedQuery: string): Promise<OfferView[]>;
}

export class CommercialCatalog implements CommercialCatalogReader {
  constructor(private readonly queries: CatalogQueryPort) {}

  getProfile() {
    return this.queries.findProfile();
  }

  findCurrentOffers(query: string) {
    return this.queries.findOffers(query.trim().toLocaleUpperCase("pt-BR"));
  }
}
