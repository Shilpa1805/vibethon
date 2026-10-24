// SousArtist - Serverless Rate-Limiting LLM Proxy
// Keeps the provider API key secure off-client and rate-limits anonymous callers.

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
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  // Rate Limiting by Client IP (first address in x-forwarded-for per T8)
  const forwardedHeader = req.headers['x-forwarded-for'];
  const rawIp = typeof forwardedHeader === 'string'
    ? forwardedHeader.split(',')[0].trim()
    : Array.isArray(forwardedHeader)
    ? forwardedHeader[0].trim()
    : req.socket?.remoteAddress || 'anonymous';
  const clientIp = rawIp || 'anonymous';

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
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Rate limit exceeded. Please wait 1 minute.' }));
    return;
  }

  const apiKey = process.env.SOUSARTIST_LLM_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Proxy API key not configured on server.' }));
    return;
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid JSON request body.' }));
        return;
      }
    }

    const { prompt, systemPrompt } = body || {};

    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing or invalid prompt in request body.' }));
      return;
    }

    if (prompt.length > 2000) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Prompt exceeds maximum length of 2,000 characters.' }));
      return;
    }

    const sanitizedSystemPrompt = typeof systemPrompt === 'string'
      ? systemPrompt.slice(0, 4000)
      : undefined;

    // Model is read from the GEMINI_MODEL environment variable so it can be swapped
    // without a code change as Google rotates deprecations.
    // Default: gemini-3.5-flash (active as of Oct 2026).
    // See: https://ai.google.dev/gemini-api/docs/models for current model IDs.
    // Set GEMINI_MODEL=<new-model-id> in your Vercel/deployment env to upgrade.
    const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const requestPayload: any = {
      contents: [
        { role: 'user', parts: [{ text: prompt }] },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 150,
      },
    };

    if (sanitizedSystemPrompt) {
      requestPayload.systemInstruction = {
        parts: [{ text: sanitizedSystemPrompt }],
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      let mappedStatus = 502;
      if (response.status === 429) {
        mappedStatus = 429;
      } else if (response.status === 504) {
        mappedStatus = 504;
      }
      res.statusCode = mappedStatus;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `Provider error: upstream returned HTTP ${response.status}` }));
      return;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ text }));
  } catch (err: any) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Proxy request failed.' }));
  }
}
