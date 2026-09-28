import {
  BOOKING_DETAIL_LINK,
  BOOKING_EMBEDDED_STATE,
  buildBookingSearchUrl,
  isBookingGraphql,
} from '../adapters/booking/search.js';
import {
  AIRBNB_DETAIL_LINK,
  AIRBNB_EMBEDDED_STATE,
  airbnbOperationFromUrl,
  buildAirbnbSearchUrl,
  isAirbnbGraphql,
} from '../adapters/airbnb/search.js';
import { graphqlOperationName } from '../crawl/capture.js';
import type { SearchParams } from '../types.js';

export interface CaptureSpec {
  platform: 'booking' | 'airbnb';
  maxConcurrency: number;
  searchUrl(p: SearchParams): string;
  matchResponse(url: URL, method: string): boolean;
  kindOf(url: URL, postData: string | null): string;
  /** Scripts con estado embebido (JSON) a guardar: nombre -> selector CSS. */
  embeddedState: Record<string, string>;
  /** Link al detalle del primer resultado (solo para navegar, no para extraer datos). */
  detailLink: string;
}

export const CAPTURE_SPECS: Record<CaptureSpec['platform'], CaptureSpec> = {
  booking: {
    platform: 'booking',
    maxConcurrency: 1,
    searchUrl: buildBookingSearchUrl,
    matchResponse: isBookingGraphql,
    kindOf: (url, postData) => `booking.graphql.${graphqlOperationName(postData, url)}`,
    embeddedState: BOOKING_EMBEDDED_STATE,
    detailLink: BOOKING_DETAIL_LINK,
  },
  airbnb: {
    platform: 'airbnb',
    maxConcurrency: 1,
    searchUrl: buildAirbnbSearchUrl,
    matchResponse: (url) => isAirbnbGraphql(url),
    kindOf: (url) => `airbnb.graphql.${airbnbOperationFromUrl(url)}`,
    embeddedState: AIRBNB_EMBEDDED_STATE,
    detailLink: AIRBNB_DETAIL_LINK,
  },
};
