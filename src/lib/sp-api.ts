// Cliente para la Amazon SP-API — Catalog Items API 2022-04-01.
// Desde octubre 2023 SP-API ya no requiere firma AWS SigV4/IAM: basta el access
// token LWA en el header `x-amz-access-token`. Ver:
// https://developer-docs.amazon.com/sp-api/changelog/sp-api-will-no-longer-require-aws-iam-or-aws-signature-version-4

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const SP_API_BASE_URL = 'https://sellingpartnerapi-na.amazon.com'; // Región NA (incluye México)
const MARKETPLACE_ID_MX = 'A1AM78C64UM0Y8';
const INCLUDED_DATA =
  'summaries,attributes,images,salesRanks,productTypes,identifiers,classifications';

const ASIN_PATTERN = /^[A-Z0-9]{10}$/;

export function isAsin(input: string): boolean {
  return ASIN_PATTERN.test(input.trim().toUpperCase());
}

export class SpApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly input: string,
  ) {
    super(message);
    this.name = 'SpApiError';
  }
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  const clientId = process.env.SP_API_CLIENT_ID!;
  const clientSecret = process.env.SP_API_CLIENT_SECRET!;
  const refreshToken = process.env.SP_API_REFRESH_TOKEN!;

  const res = await fetch(LWA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`No se pudo obtener el access token LWA (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    // Refresca 60s antes de que expire para no arriesgar una llamada con token vencido.
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.accessToken;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Cada operación de SP-API tiene su propio usage plan (requests/seg y burst). Se espacían
// las llamadas por operación y, ante 429, se reintenta con backoff exponencial antes de
// rendirse. Fuente de los usage plans: modelos OpenAPI en github.com/amzn/selling-partner-api-models.
const CATALOG_MIN_INTERVAL_MS = 600; // Catalog Items: ~2 req/seg, burst 2.
const PRICING_MIN_INTERVAL_MS = 2100; // Product Pricing v0 (getCompetitivePricing): 0.5 req/seg, burst 1.
const FEES_MIN_INTERVAL_MS = 1100; // Product Fees v0 (getMyFeesEstimateForASIN): 1 req/seg, burst 2.
const MAX_RETRIES = 3;
const lastCallAt = new Map<string, number>();

async function throttle(operation: string, minIntervalMs: number) {
  const last = lastCallAt.get(operation) ?? 0;
  const wait = last + minIntervalMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt.set(operation, Date.now());
}

interface SpApiCallOptions {
  operation: string;
  method?: 'GET' | 'POST';
  path: string;
  searchParams?: Record<string, string>;
  body?: unknown;
  minIntervalMs: number;
  input: string;
}

async function callSpApi(options: SpApiCallOptions): Promise<unknown> {
  const { operation, method = 'GET', path, searchParams, body, minIntervalMs, input } = options;

  const url = new URL(`${SP_API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle(operation, minIntervalMs);
    const accessToken = await getAccessToken();
    const res = await fetch(url, {
      method,
      headers: {
        'x-amz-access-token': accessToken,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      await sleep(500 * 2 ** attempt);
      continue;
    }

    if (!res.ok) {
      const responseBody = (await res.json().catch(() => null)) as {
        errors?: { message?: string }[];
      } | null;
      const message =
        responseBody?.errors?.[0]?.message ?? `SP-API respondió ${res.status} para "${input}"`;
      throw new SpApiError(message, res.status, input);
    }

    return res.json();
  }

  throw new SpApiError(
    `SP-API siguió respondiendo 429 tras ${MAX_RETRIES} reintentos`,
    429,
    input,
  );
}

async function callCatalogApi(
  operation: string,
  path: string,
  searchParams: Record<string, string>,
  input: string,
): Promise<unknown> {
  return callSpApi({
    operation,
    method: 'GET',
    path,
    searchParams,
    minIntervalMs: CATALOG_MIN_INTERVAL_MS,
    input,
  });
}

export async function getCatalogItem(asin: string): Promise<unknown> {
  return callCatalogApi(
    'getCatalogItem',
    `/catalog/2022-04-01/items/${asin}`,
    { marketplaceIds: MARKETPLACE_ID_MX, includedData: INCLUDED_DATA },
    asin,
  );
}

export async function searchCatalogItems(keyword: string): Promise<unknown> {
  const data = (await callCatalogApi(
    'searchCatalogItems',
    '/catalog/2022-04-01/items',
    {
      marketplaceIds: MARKETPLACE_ID_MX,
      keywords: keyword,
      includedData: INCLUDED_DATA,
      pageSize: '1',
    },
    keyword,
  )) as { items?: unknown[] };

  const item = data.items?.[0];
  if (!item) {
    throw new SpApiError(`No se encontraron resultados para "${keyword}"`, 404, keyword);
  }
  return item;
}

// --- Product Pricing API v0 ---

export interface MoneyAmount {
  CurrencyCode?: string;
  Amount?: number;
}

interface CompetitivePriceEntry {
  CompetitivePriceId?: string; // '1' = New Buy Box, '2' = Used Buy Box
  condition?: string;
  Price?: {
    LandedPrice?: MoneyAmount;
    ListingPrice?: MoneyAmount;
    Shipping?: MoneyAmount;
  };
}

interface OfferListingCount {
  Count?: number;
  condition?: string;
}

interface SalesRank {
  ProductCategoryId?: string;
  Rank?: number;
}

interface ProductPricingPayloadEntry {
  status?: string;
  ASIN?: string;
  Product?: {
    CompetitivePricing?: {
      CompetitivePrices?: CompetitivePriceEntry[];
      NumberOfOfferListings?: OfferListingCount[];
    };
    SalesRankings?: SalesRank[];
  };
}

export interface CompetitivePricingResult {
  asin: string;
  buyBoxNewPrice: MoneyAmount | null;
  numberOfOfferListings: OfferListingCount[];
  salesRankings: SalesRank[];
  raw: unknown;
}

// getCompetitivePricing con ItemType=Asin no requiere que tengamos una oferta propia: da
// el panorama competitivo del ASIN en el marketplace (Buy Box, conteo de ofertas, sales
// rank), a diferencia de getPricing/getItemOffers que están pensados para un seller con
// listing activo.
export async function getCompetitivePricing(asin: string): Promise<CompetitivePricingResult> {
  const data = (await callSpApi({
    operation: 'getCompetitivePricing',
    method: 'GET',
    path: '/products/pricing/v0/competitivePrice',
    searchParams: { MarketplaceId: MARKETPLACE_ID_MX, Asins: asin, ItemType: 'Asin' },
    minIntervalMs: PRICING_MIN_INTERVAL_MS,
    input: asin,
  })) as { payload?: ProductPricingPayloadEntry[] };

  const product = data.payload?.[0]?.Product;
  const competitivePrices = product?.CompetitivePricing?.CompetitivePrices ?? [];
  const buyBoxNew = competitivePrices.find((p) => p.CompetitivePriceId === '1');

  return {
    asin,
    buyBoxNewPrice: buyBoxNew?.Price?.ListingPrice ?? null,
    numberOfOfferListings: product?.CompetitivePricing?.NumberOfOfferListings ?? [],
    salesRankings: product?.SalesRankings ?? [],
    raw: product ?? null,
  };
}

// --- Product Fees API v0 ---

interface FeeDetailEntry {
  FeeType?: string;
  FeeAmount?: MoneyAmount;
  FinalFee?: MoneyAmount;
}

interface FeesEstimateResultLike {
  Status?: string;
  FeesEstimate?: {
    TotalFeesEstimate?: MoneyAmount;
    FeeDetailList?: FeeDetailEntry[];
  };
  Error?: { Message?: string };
}

export interface FeesEstimate {
  status: string;
  totalFeesAmount: MoneyAmount | null;
  feeDetails: { feeType?: string; amount?: MoneyAmount }[];
  errorMessage?: string;
}

// A diferencia de Catalog/Pricing, un fallo "de negocio" en Fees API (p.ej. no se pudo
// estimar) llega como HTTP 200 con FeesEstimateResult.Status !== 'Success', no como error
// HTTP. Se devuelve como resultado "vacío" en vez de lanzar, para que el caller lo trate
// como dato sin_dato en vez de un error de la corrida.
export async function getFeesEstimate(
  asin: string,
  price: { amount: number; currencyCode: string },
  isAmazonFulfilled: boolean,
): Promise<FeesEstimate> {
  const identifier = `analyst-${asin}-${isAmazonFulfilled ? 'fba' : 'fbm'}-${Date.now()}`;

  const data = (await callSpApi({
    operation: 'getMyFeesEstimateForASIN',
    method: 'POST',
    path: `/products/fees/v0/items/${asin}/feesEstimate`,
    body: {
      FeesEstimateRequest: {
        MarketplaceId: MARKETPLACE_ID_MX,
        IsAmazonFulfilled: isAmazonFulfilled,
        PriceToEstimateFees: {
          ListingPrice: { CurrencyCode: price.currencyCode, Amount: price.amount },
        },
        Identifier: identifier,
      },
    },
    minIntervalMs: FEES_MIN_INTERVAL_MS,
    input: asin,
  })) as { payload?: { FeesEstimateResult?: FeesEstimateResultLike } };

  const result = data.payload?.FeesEstimateResult;
  if (!result || result.Status !== 'Success') {
    return {
      status: result?.Status ?? 'Unknown',
      totalFeesAmount: null,
      feeDetails: [],
      errorMessage: result?.Error?.Message,
    };
  }

  return {
    status: 'Success',
    totalFeesAmount: result.FeesEstimate?.TotalFeesEstimate ?? null,
    feeDetails: (result.FeesEstimate?.FeeDetailList ?? []).map((fee) => ({
      feeType: fee.FeeType,
      amount: fee.FinalFee ?? fee.FeeAmount,
    })),
  };
}

// Punto de entrada único para el Scout Agent: decide si el input es un ASIN o un
// keyword y llama a la operación correspondiente.
export async function lookupCatalogItem(input: string): Promise<unknown> {
  const trimmed = input.trim();
  return isAsin(trimmed) ? getCatalogItem(trimmed.toUpperCase()) : searchCatalogItems(trimmed);
}
