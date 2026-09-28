import { Platform, PropertyType, RunStatus } from './generated/prisma/enums.js';

export { Platform, PropertyType, RunStatus };

export const PLATFORMS = Object.values(Platform) as [Platform, ...Platform[]];
export const PROPERTY_TYPES = Object.values(PropertyType) as [PropertyType, ...PropertyType[]];

/** Claves de plataforma usadas en trip.config.json y en la CLI (`--platforms`). */
export const PLATFORM_KEYS = {
  google_hotels: Platform.GOOGLE_HOTELS,
  tripadvisor: Platform.TRIPADVISOR,
  xotelo: Platform.XOTELO,
  booking: Platform.BOOKING,
  airbnb: Platform.AIRBNB,
  expedia: Platform.EXPEDIA,
  vrbo: Platform.VRBO,
  agoda: Platform.AGODA,
  despegar: Platform.DESPEGAR,
} as const satisfies Record<string, Platform>;

export type PlatformKey = keyof typeof PLATFORM_KEYS;
export const PLATFORM_KEY_LIST = Object.keys(PLATFORM_KEYS) as [PlatformKey, ...PlatformKey[]];

export interface SearchParams {
  destination: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string;
  adults: number;
  childAges: number[];
  currency: string;
  locale: { hl: string; gl: string };
}

export type AdapterStatus = 'OK' | 'PARTIAL' | 'BLOCKED' | 'BLOCKED_BY_ROBOTS' | 'FAILED';

/** Listing ya validado y normalizado por un adaptador. Campos ausentes en la fuente = null (regla 12). */
export interface NormalizedListing {
  platform: Platform;
  externalId: string;
  url: string;
  name: string;
  propertyType: PropertyType | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  city: string | null;
  country: string | null;
  starRating: number | null;
  rating: number | null;
  ratingScale: number | null;
  reviewCount: number | null;
  maxGuests: number | null;
  bedrooms: number | null;
  rawAmenities: string[];
  rawDetail: unknown;
}

export interface NormalizedSnapshot {
  platform: Platform;
  externalId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  roomName: string | null;
  nightlyPrice: number | null;
  totalPrice: number | null;
  taxesIncluded: boolean | null;
  fees: Record<string, number> | null;
  currency: string;
  freeCancellation: boolean | null;
  breakfastIncluded: boolean | null;
  provider: string | null;
}

export interface NormalizedAvailabilityDay {
  platform: Platform;
  externalId: string;
  date: string; // YYYY-MM-DD
  available: boolean;
  minNights: number | null;
  price: number | null;
  currency: string | null;
}

export interface RawPayloadInput {
  kind: string;
  url?: string;
  body: unknown;
}

export interface AdapterResult {
  status: AdapterStatus;
  listings: NormalizedListing[];
  snapshots: NormalizedSnapshot[];
  calendar?: NormalizedAvailabilityDay[];
  rawPayloads: RawPayloadInput[];
  warnings: string[];
  /** Elementos descartados por fallar campos obligatorios (id, nombre). */
  discarded?: number;
}
