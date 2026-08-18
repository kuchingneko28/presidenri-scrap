import { describe, it, expect } from 'bun:test';
import { parseBrowserRequestHeaders, findHeader } from '../src/storage/curl';

describe('cURL Parser', () => {
  it('parses headers from standard curl commands', () => {
    const curl = `curl 'https://www.presidenri.go.id/' -H 'accept: text/html' -H 'User-Agent: Mozilla/5.0'`;
    const headers = parseBrowserRequestHeaders(curl);

    expect(headers['accept']).toBe('text/html');
    expect(headers['user-agent']).toBe('Mozilla/5.0');
    expect(findHeader(headers, 'User-Agent')).toBe('Mozilla/5.0');
  });

  it('parses cookies from -b or --cookie option', () => {
    const curl = `curl 'https://www.presidenri.go.id/' -b 'cf_clearance=abc123xyz; session=token'`;
    const headers = parseBrowserRequestHeaders(curl);

    expect(headers['cookie']).toBe('cf_clearance=abc123xyz; session=token');
    expect(findHeader(headers, 'Cookie')).toBe('cf_clearance=abc123xyz; session=token');
  });

  it('finds headers case-insensitively', () => {
    const headers = { 'user-agent': 'CustomAgent', 'x-custom': '123' };
    expect(findHeader(headers, 'User-Agent')).toBe('CustomAgent');
    expect(findHeader(headers, 'X-Custom')).toBe('123');
    expect(findHeader(headers, 'missing')).toBeUndefined();
  });
});
