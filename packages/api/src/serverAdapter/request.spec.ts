import { describe, expect, it } from 'vitest';
import { buildBullBoardRequest } from './request';

describe('buildBullBoardRequest', () => {
  it('assembles the board request from a raw server request', () => {
    const queues = new Map();
    const request = buildBullBoardRequest(
      queues,
      { boardTitle: 'Ops' },
      {
        query: { page: '1' },
        params: { queueName: 'email' },
        body: { name: 'job' },
        headers: { 'content-type': 'application/json' },
      }
    );

    expect(request).toEqual({
      queues,
      uiConfig: { boardTitle: 'Ops' },
      query: { page: '1' },
      params: { queueName: 'email' },
      body: { name: 'job' },
      headers: { 'content-type': 'application/json' },
    });
  });

  it('defaults an absent body to an empty object', () => {
    const request = buildBullBoardRequest(new Map(), {}, {
      query: {},
      params: {},
      body: undefined,
      headers: {},
    });

    expect(request.body).toEqual({});
  });
});
