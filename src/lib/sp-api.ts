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

// Catalog Items API permite ~2 req/seg por operación con burst de 2. Se espacían las
// llamadas y, ante 429, se reintenta con backoff exponencial antes de rendirse.
const MIN_INTERVAL_MS = 600;
const MAX_RETRIES = 3;
const lastCallAt = new Map<string, number>();

async function throttle(operation: string) {
  const last = lastCallAt.get(operation) ?? 0;
  const wait = last + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt.set(operation, Date.now());
}

async function callCatalogApi(
  operation: string,
  path: string,
  searchParams: Record<string, string>,
  input: string,
): Promise<unknown> {
  const url = new URL(`${SP_API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle(operation);
    const accessToken = await getAccessToken();
    const res = await fetch(url, {
      headers: { 'x-amz-access-token': accessToken, Accept: 'application/json' },
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      await sleep(500 * 2 ** attempt);
      continue;
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        errors?: { message?: string }[];
      } | null;
      const message =
        body?.errors?.[0]?.message ?? `SP-API respondió ${res.status} para "${input}"`;
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

// Punto de entrada único para el Scout Agent: decide si el input es un ASIN o un
// keyword y llama a la operación correspondiente.
export async function lookupCatalogItem(input: string): Promise<unknown> {
  const trimmed = input.trim();
  return isAsin(trimmed) ? getCatalogItem(trimmed.toUpperCase()) : searchCatalogItems(trimmed);
}
