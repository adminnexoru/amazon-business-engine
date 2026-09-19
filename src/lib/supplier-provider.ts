// Fuente de proveedores: Apify actor "scrapesage/alibaba-scraper".
// Validado con corrida real (19 sep 2026): 5 productos, $0.048 total,
// ladderPrices/MOQ reales y variados, leadTimes confirmado SIEMPRE null en
// la práctica (el campo existe en el schema del actor pero Alibaba no
// expone ese dato de forma consistente vía scraping público).
//
// Variables de entorno requeridas:
//   APIFY_API_TOKEN            — ya existe, compartido con reviews-provider.ts
//   APIFY_SUPPLIER_ACTOR_ID    — 'scrapesage~alibaba-scraper'

export class NoSupplierSourceConfiguredError extends Error {
  constructor() {
    super('NO_SUPPLIER_SOURCE_CONFIGURED');
    this.name = 'NoSupplierSourceConfiguredError';
  }
}

export interface SupplierLadderPrice {
  minQty: number;
  maxQty: number | null;
  price: number;
}

export interface SupplierProductOption {
  productId: string;
  title: string;
  url: string;
  priceMin: number | null;
  priceMax: number | null;
  currency: string | null;
  moq: number | null;
  moqUnit: string | null;
  ladderPrices: SupplierLadderPrice[];
  // Confirmado siempre null en pruebas reales — se conserva el campo por si
  // el actor lo puebla en el futuro, pero NO asumir que tendrá dato.
  leadTimeDays: number | null;
  packaging: {
    unitWeightKg: number | null;
    unitVolumeCbm: number | null;
    unitSize: string | null;
  } | null;
  tradeAssurance: boolean | null;
  supplierId: string;
}

export interface SupplierLead {
  supplierId: string;
  supplierName: string;
  country: string | null;
  businessType: string | null;
  yearsOnAlibaba: number | null;
  employees: string | null;
  responseTime: string | null;
  onTimeDeliveryRate: string | null;
  goldSupplier: boolean | null;
  verifiedSupplier: boolean | null;
  tradeAssurance: boolean | null;
  tradeAssuranceAmount: string | null;
  topRatedSupplier: boolean | null;
  ratingAvg: number | null;
  totalReviews: number | null;
  leadScore: number | null;
  avgProductPrice: number | null;
  sampleProducts: string[];
}

export interface SupplierSearchResult {
  products: SupplierProductOption[];
  leads: SupplierLead[];
}

// Forma cruda del dataset del actor: registros "product" y "supplier" comparten el mismo
// array, distinguidos por "type". Todos los campos son opcionales porque el actor no
// garantiza presencia de cada uno (p.ej. leadTimes confirmado siempre vacío).
interface ApifyLadderPriceItem {
  minQty?: number;
  maxQty?: number | null;
  price?: number;
}

interface ApifyLeadTimeItem {
  days?: number;
}

interface ApifyPackagingItem {
  unitWeightKg?: number;
  unitVolumeCbm?: number;
  unitSize?: string;
}

interface ApifySupplierRecord {
  type?: 'product' | 'supplier';

  // Campos de un registro "product"
  productId?: string;
  title?: string;
  url?: string;
  priceMin?: number;
  priceMax?: number;
  currency?: string;
  moq?: number;
  moqUnit?: string;
  ladderPrices?: ApifyLadderPriceItem[];
  leadTimes?: ApifyLeadTimeItem[];
  packaging?: ApifyPackagingItem;
  tradeAssurance?: boolean;
  supplierId?: string;
  supplier?: { supplierId?: string };

  // Campos de un registro "supplier"
  supplierName?: string;
  country?: string;
  businessType?: string;
  yearsOnAlibaba?: number;
  employees?: string;
  responseTime?: string;
  onTimeDeliveryRate?: string;
  goldSupplier?: boolean;
  verifiedSupplier?: boolean;
  tradeAssuranceAmount?: string;
  topRatedSupplier?: boolean;
  ratingAvg?: number;
  totalReviews?: number;
  leadScore?: number;
  avgProductPrice?: number;
  sampleProducts?: string[];
}

const APIFY_ACTOR_RUN_SYNC_URL = (actorId: string) =>
  `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items`;

const MAX_PRODUCTS = 10;

export async function getSupplierOptions(searchTerms: string[]): Promise<SupplierSearchResult> {
  const apiToken = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_SUPPLIER_ACTOR_ID;

  if (!apiToken || !actorId) {
    throw new NoSupplierSourceConfiguredError();
  }

  const response = await fetch(`${APIFY_ACTOR_RUN_SYNC_URL(actorId)}?token=${apiToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      searchTerms,
      country: 'US',
      maxProducts: MAX_PRODUCTS,
      includeProductDetails: true,
      outputSupplierLeads: true,
      deduplicateProducts: true,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Apify (scrapesage/alibaba-scraper) respondió ${response.status}: ${await response.text()}`,
    );
  }

  const items = (await response.json()) as ApifySupplierRecord[];

  const products: SupplierProductOption[] = items
    .filter((item) => item.type === 'product')
    .map((raw) => ({
      productId: raw.productId ?? '',
      title: raw.title ?? '',
      url: raw.url ?? '',
      priceMin: typeof raw.priceMin === 'number' ? raw.priceMin : null,
      priceMax: typeof raw.priceMax === 'number' ? raw.priceMax : null,
      currency: raw.currency ?? null,
      moq: typeof raw.moq === 'number' ? raw.moq : null,
      moqUnit: raw.moqUnit ?? null,
      ladderPrices: (raw.ladderPrices ?? [])
        .filter(
          (lp): lp is Required<Pick<ApifyLadderPriceItem, 'minQty' | 'price'>> & ApifyLadderPriceItem =>
            typeof lp.minQty === 'number' && typeof lp.price === 'number',
        )
        .map((lp) => ({
          minQty: lp.minQty,
          maxQty: typeof lp.maxQty === 'number' ? lp.maxQty : null,
          price: lp.price,
        })),
      // Confirmado siempre null en la práctica — ver nota al inicio del archivo.
      leadTimeDays: typeof raw.leadTimes?.[0]?.days === 'number' ? raw.leadTimes[0].days : null,
      packaging: raw.packaging
        ? {
            unitWeightKg: typeof raw.packaging.unitWeightKg === 'number' ? raw.packaging.unitWeightKg : null,
            unitVolumeCbm: typeof raw.packaging.unitVolumeCbm === 'number' ? raw.packaging.unitVolumeCbm : null,
            unitSize: raw.packaging.unitSize ?? null,
          }
        : null,
      tradeAssurance: typeof raw.tradeAssurance === 'boolean' ? raw.tradeAssurance : null,
      supplierId: raw.supplierId ?? raw.supplier?.supplierId ?? '',
    }));

  const leads: SupplierLead[] = items
    .filter((item) => item.type === 'supplier')
    .map((raw) => ({
      supplierId: raw.supplierId ?? '',
      supplierName: raw.supplierName ?? '',
      country: raw.country ?? null,
      businessType: raw.businessType ?? null,
      yearsOnAlibaba: typeof raw.yearsOnAlibaba === 'number' ? raw.yearsOnAlibaba : null,
      employees: raw.employees ?? null,
      responseTime: raw.responseTime ?? null,
      onTimeDeliveryRate: raw.onTimeDeliveryRate ?? null,
      goldSupplier: typeof raw.goldSupplier === 'boolean' ? raw.goldSupplier : null,
      verifiedSupplier: typeof raw.verifiedSupplier === 'boolean' ? raw.verifiedSupplier : null,
      tradeAssurance: typeof raw.tradeAssurance === 'boolean' ? raw.tradeAssurance : null,
      tradeAssuranceAmount: raw.tradeAssuranceAmount ?? null,
      topRatedSupplier: typeof raw.topRatedSupplier === 'boolean' ? raw.topRatedSupplier : null,
      ratingAvg: typeof raw.ratingAvg === 'number' ? raw.ratingAvg : null,
      totalReviews: typeof raw.totalReviews === 'number' ? raw.totalReviews : null,
      leadScore: typeof raw.leadScore === 'number' ? raw.leadScore : null,
      avgProductPrice: typeof raw.avgProductPrice === 'number' ? raw.avgProductPrice : null,
      sampleProducts: Array.isArray(raw.sampleProducts) ? raw.sampleProducts : [],
    }));

  return { products, leads };
}
