// SousArtist - Serverless Rate-Limiting LLM Proxy
// Keeps the provider API key secure off-client and rate-limits anonymous callers.

import type { IncomingMessage, ServerResponse } from 'http';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const MAX_REQUESTS_PER_MINUTE = 20;

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  // Rate Limiting by Client IP
  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'anonymous';
  const now = Date.now();
  const entry = rateLimitMap.get(clientIp) || { count: 0, resetAt: now + 60000 };

  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + 60000;
  } else {
    entry.count += 1;
  }
  rateLimitMap.set(clientIp, entry);

  if (entry.count > MAX_REQUESTS_PER_MINUTE) {
    res.statusCode = 429;
    res.end(JSON.stringify({ error: 'Rate limit exceeded. Please wait 1 minute.' }));
    return;
  }

  const apiKey = process.env.SOUSARTIST_LLM_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.statusCode = 503;
    res.end(JSON.stringify({ error: 'Proxy API key not configured on server.' }));
    return;
  }

  try {
    const { prompt, systemPrompt } = req.body || {};
    if (!prompt) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Missing prompt in request body.' }));
      return;
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          ...(systemPrompt ? [{ role: 'user', parts: [{ text: systemPrompt }] }] : []),
          { role: 'user', parts: [{ text: prompt }] },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 150,
        },
      }),
    });

    const data = await response.json();
    res.statusCode = response.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err?.message || 'Proxy request failed.' }));
  }
}
