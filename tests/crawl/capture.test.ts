import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  attachJsonCapture,
  graphqlOperationName,
  stripQuerySecrets,
  type PageLike,
  type ResponseLike,
} from '../../src/crawl/capture.js';
import { isBookingGraphql } from '../../src/adapters/booking/search.js';

function fakeResponse(
  url: string,
  method: string,
  body: unknown,
  postData: string | null = null,
): ResponseLike {
  return {
    url: () => url,
    status: () => 200,
    headers: () => ({ 'content-type': 'application/json; charset=utf-8' }),
    request: () => ({ method: () => method, postData: () => postData }),
    json: async () => body,
  };
}

describe('attachJsonCapture', () => {
  it('guarda solo las respuestas que matchean, con su kind', async () => {
    const page = new EventEmitter() as unknown as PageLike & EventEmitter;
    const cap = attachJsonCapture(page, {
      match: isBookingGraphql,
      kindOf: (url, pd) => `booking.graphql.${graphqlOperationName(pd, url)}`,
    });
    page.emit(
      'response',
      fakeResponse(
        'https://www.booking.com/dml/graphql?lang=es',
        'POST',
        { data: 1 },
        '{"operationName":"FullSearch"}',
      ),
    );
    page.emit('response', fakeResponse('https://www.booking.com/other', 'GET', { x: 1 }));
    await cap.stop();
    page.emit(
      'response',
      fakeResponse('https://www.booking.com/dml/graphql', 'POST', {}, '{"operationName":"Late"}'),
    );
    expect(cap.payloads).toEqual([
      {
        kind: 'booking.graphql.FullSearch',
        url: 'https://www.booking.com/dml/graphql?lang=es',
        body: { data: 1 },
      },
    ]);
  });
});

describe('graphqlOperationName', () => {
  it('lee operationName de la URL, de un body o de un batch', () => {
    expect(graphqlOperationName(null, new URL('https://a.test/api/v3/X/h?operationName=StaysSearch'))).toBe(
      'StaysSearch',
    );
    expect(graphqlOperationName('{"operationName":"FullSearch"}')).toBe('FullSearch');
    expect(graphqlOperationName('[{"operationName":"AvailabilityCalendar"}]')).toBe('AvailabilityCalendar');
    expect(graphqlOperationName('no-json')).toBe('unknown');
  });
});

describe('stripQuerySecrets', () => {
  it('redacta parámetros sensibles de la URL', () => {
    expect(stripQuerySecrets(new URL('https://a.test/x?key=abc&lang=es&csrf_token=zz'))).toBe(
      'https://a.test/x?key=REDACTED&lang=es&csrf_token=REDACTED',
    );
  });
});
