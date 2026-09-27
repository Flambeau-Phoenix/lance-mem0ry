/**
 * Safe fetch utility with automatic retries and exponential backoff
 * Prevents "Failed to fetch" unhandled errors during server restarts or transient delays
 */

export async function safeFetchJson<T>(
  url: string,
  options?: RequestInit,
  retries = 3,
  delayMs = 800
): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
      } else {
        // Log gently without throwing fatal unhandled errors
        console.warn(`[apiClient] Network request to ${url} deferred:`, err);
        return null;
      }
    }
  }
  return null;
}
