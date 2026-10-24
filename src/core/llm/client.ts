// SousArtist - Provider-Agnostic LLM Client
// Resilient: 8s timeout, jittered retry, payload cache, offline degradation

export interface LlmClient {
  generateText(prompt: string, systemPrompt?: string): Promise<string>;
}

export interface RequestPayload {
  prompt: string;
  systemPrompt?: string;
}

declare const __SOUSARTIST_PROXY_URL__: string | undefined;

export class ResilientLlmClient implements LlmClient {
  private cache = new Map<string, string>();
  private proxyUrl: string;

  constructor(options?: { proxyUrl?: string }) {
    this.proxyUrl =
      options?.proxyUrl ??
      (typeof __SOUSARTIST_PROXY_URL__ !== 'undefined' ? __SOUSARTIST_PROXY_URL__ : '');
  }

  // djb2 32-bit string hash for payload cache deduplication.
  // This is NOT a cryptographic hash — it prevents duplicate LLM calls for identical
  // prompt+system pairs within a single plugin session, not across restarts.
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

    if (!this.proxyUrl) {
      throw new Error('OFFLINE_NO_PROXY');
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

        const response = await fetch(this.proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, systemPrompt }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP_${response.status}`);
        }

        const data = await response.json();
        const text = typeof data?.text === 'string' ? data.text.trim() : '';
        if (text) {
          this.cache.set(cacheKey, text);
          return text;
        }
        throw new Error('EMPTY_RESPONSE');
      } catch (err: any) {
        lastError = err;
      }
    }

    throw lastError || new Error('LLM_REQUEST_FAILED');
  }
}
