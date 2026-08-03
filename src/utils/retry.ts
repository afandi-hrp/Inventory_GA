/**
 * Utility to retry a function that returns a promise.
 * Useful for handling transient network errors like "Failed to fetch".
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000,
  onRetry?: (attempt: number, error: any) => void
): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Only retry on network errors or specific transient errors
      const isNetworkError = 
        error.message?.includes('Failed to fetch') || 
        error.message?.includes('Network Error') ||
        error.name === 'TypeError' ||
        error.status === 502 ||
        error.status === 503 ||
        error.status === 504;

      if (!isNetworkError || i === retries - 1) {
        throw error;
      }

      if (onRetry) {
        onRetry(i + 1, error);
      }

      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
  
  throw lastError;
}
