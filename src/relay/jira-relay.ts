import { NextRequest, NextResponse } from 'next/server';

// Simple CORS-only edge relay so CF-Workers egress IP block (HTTP 403 CF
// "Attention Required") stops breaking Jira API calls.  Whitelist your Atlassian
// tenant here – anything else 403s immediately.

const ALLOWED_ORIGIN = 'https://acoltp.atlassian.net'; // <- swap for your tenant

export const config = {
  runtime: 'edge',
  unstable_allowDynamic: [],
};

const RELAY_SECRET = '__relay_secret_placeholder__'; // same value you'll set in worker secrets

export default async function handler(req: NextRequest) {
  const url = new URL(req.url);

  // Only ever proxy requests to the Atlassian API
  if (!url.origin.endsWith('.atlassian.net')) {
    return new Response('Forbidden', { status: 403 });
  }

  // Optional shared-secret check – helps prove traffic is coming via relay
  if (url.searchParams.get('relay_secret') !== RELAY_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const target = `${ALLOWED_ORIGIN}${url.pathname}${url.search}`;
  // re-write search params for relay_secret drop
  const targetUrl = new URL(target);
  targetUrl.searchParams.delete('relay_secret');

  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    if (['host', 'content-length', 'connection', 'accept-encoding'].includes(k)) return;
    headers[k] = v;
  });

  // Strip browser-only Origin/Referer so Atlassian doesn't reject on CORS
  delete headers['origin'];
  delete headers['referer'];

  const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.arrayBuffer() : undefined;
  if (body) {
    headers['content-length'] = String(body.byteLength);
  }

  const res = await fetch(targetUrl.toString(), {
    method: req.method,
    headers,
    body,
    redirect: 'manual',
  });

  const out = new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
  });
  out.headers.set('access-control-allow-origin', '*');
  out.headers.set('access-control-expose-headers', '*');
  res.headers.forEach((v, k) => {
    if (['transfer-encoding', 'connection'].includes(k)) return;
    out.headers.set(k, v);
  });
  return out;
}