// Fuente de reviews de competidores: Apify actor "junglee/amazon-reviews-scraper".
// Confirmado con pruebas reales sobre amazon.com.mx (18 sep 2026).
//
// Variables de entorno requeridas:
//   APIFY_API_TOKEN          — token de tu cuenta de Apify
//   APIFY_REVIEWS_ACTOR_ID   — 'junglee~amazon-reviews-scraper'
//
// LIMITACIÓN CONOCIDA DEL PLAN FREE DE APIFY: 1 URL y 10 reviews por corrida.
// Por eso se llama al actor una vez por ASIN, no en batch.
//
// LIMITACIÓN CONOCIDA DE DATOS: el actor no parsea fechas en español (date
// viene null); se conserva reviewedIn como texto crudo sin parsear.
//
// BUG CONOCIDO DEL ACTOR: country/countryCode vienen corruptos — se ignoran.

export class NoReviewsSourceConfiguredError extends Error {
  constructor() {
    super('NO_REVIEWS_SOURCE_CONFIGURED');
    this.name = 'NoReviewsSourceConfiguredError';
  }
}

export interface CompetitorReview {
  asin: string;
  rating: number | null;
  title: string | null;
  body: string;
  reviewed_in_raw: string | null;
  verified_purchase: boolean | null;
}

interface ApifyReviewItem {
  productAsin?: string;
  productOriginalAsin?: string;
  ratingScore?: number;
  reviewTitle?: string;
  reviewDescription?: string;
  reviewedIn?: string;
  isVerified?: boolean;
}

const APIFY_ACTOR_RUN_SYNC_URL = (actorId: string) =>
  `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items`;

const MAX_REVIEWS_PER_ASIN = 50;

function buildAmazonMxProductUrl(asin: string): string {
  return `https://www.amazon.com.mx/dp/${asin}/`;
}

async function fetchReviewsForOneAsin(
  asin: string,
  apiToken: string,
  actorId: string,
): Promise<CompetitorReview[]> {
  const response = await fetch(`${APIFY_ACTOR_RUN_SYNC_URL(actorId)}?token=${apiToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productUrls: [{ url: buildAmazonMxProductUrl(asin) }],
      maxReviews: MAX_REVIEWS_PER_ASIN,
      sort: 'helpful',
      filterByRatings: ['allStars'],
      includeGdprSensitive: false,
      deduplicateRedirectedAsins: true,
      reviewsAlwaysSaveCategoryData: false,
      reviewsUseProductVariantFilter: false,
      scrapeProductDetails: false,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Apify (junglee/amazon-reviews-scraper) respondió ${response.status} para ASIN ${asin}: ${await response.text()}`,
    );
  }

  const items = (await response.json()) as ApifyReviewItem[];

  return items.map((raw) => ({
    asin: raw.productAsin ?? raw.productOriginalAsin ?? asin,
    rating: typeof raw.ratingScore === 'number' ? raw.ratingScore : null,
    title: raw.reviewTitle ?? null,
    body: raw.reviewDescription ?? '',
    reviewed_in_raw: raw.reviewedIn ?? null,
    verified_purchase: typeof raw.isVerified === 'boolean' ? raw.isVerified : null,
  }));
}

export async function getCompetitorReviews(asins: string[]): Promise<CompetitorReview[]> {
  const apiToken = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_REVIEWS_ACTOR_ID;

  if (!apiToken || !actorId) {
    throw new NoReviewsSourceConfiguredError();
  }

  const allReviews: CompetitorReview[] = [];
  for (const asin of asins) {
    const reviewsForAsin = await fetchReviewsForOneAsin(asin, apiToken, actorId);
    allReviews.push(...reviewsForAsin);
  }

  return allReviews;
}
