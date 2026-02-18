export async function fetchWithRetry(
  url: string,
  options: RequestInit & { timeout?: number; retries?: number } = {},
): Promise<Response> {
  const { timeout = 30000, retries = 3, ...fetchOptions } = options;
  let attempt = 0;

  while (attempt <= retries) {
    attempt++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok || response.status === 404) {
        // Don't retry on 404, but return it to caller
        return response;
      }

      if (response.status >= 500) {
        throw new Error(`Server error: ${response.status}`);
      }

      return response; // Return 4xx errors as is, caller handles them
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (attempt > retries) {
        throw error;
      }

      // Wait before retrying (exponential backoff)
      const delay = 1000 * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error("Max retries exceeded");
}
