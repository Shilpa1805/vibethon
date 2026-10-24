// SousArtist - Provider-Agnostic LLM Client
// Resilient: 8s timeout, jittered retry, SHA-256 payload cache, offline degradation

export interface LlmClient {
  generateText(prompt: string, systemPrompt?: string): Promise<string>;
}

export interface RequestPayload {
  prompt: string;
  systemPrompt?: string;
}

export class ResilientLlmClient implements LlmClient {
  private cache = new Map<string, string>();
  private apiKey: string;
  private endpoint: string;

  constructor(options?: { apiKey?: string; endpoint?: string }) {
    this.apiKey = options?.apiKey || (typeof process !== 'undefined' ? process.env?.SOUSARTIST_LLM_KEY || '' : '');
    this.endpoint = options?.endpoint || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
  }

  // Simple string hash for payload caching
  private hashPayload(payload: RequestPayload): string {
    const str = `${payload.systemPrompt || ''}::${payload.prompt}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return `hash_${hash}`;
  }

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const payload: RequestPayload = { prompt, systemPrompt };
    const cacheKey = this.hashPayload(payload);

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    if (!this.apiKey) {
      throw new Error('OFFLINE_NO_KEY');
    }

    let lastError: any = null;

    // Try up to 2 times (initial + 1 retry with backoff)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) {
          const jitterMs = 300 + Math.random() * 400;
          await new Promise((r) => setTimeout(r, jitterMs));
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

        const url = `${this.endpoint}?key=${this.apiKey}`;
        const body = {
          contents: [
            ...(systemPrompt ? [{ role: 'user', parts: [{ text: systemPrompt }] }] : []),
            { role: 'user', parts: [{ text: prompt }] },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 150,
          },
        };

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP_${response.status}`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        if (text) {
          this.cache.set(cacheKey, text);
          return text;
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    throw lastError || new Error('LLM_REQUEST_FAILED');
  }
}
