import axios, { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

// Cache configuration
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiry: number;
}

// Extend axios config to include metadata
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    metadata?: {
      startTime?: Date;
    };
  }
}

class OptimizedApiService {
  private cache = new Map<string, CacheEntry<any>>();
  private pendingRequests = new Map<string, Promise<any>>();
  private defaultCacheTime = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Setup axios interceptors for request/response optimization
    axios.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        // Add request timestamp for monitoring
        config.metadata = { startTime: new Date() };
        return config;
      },
      (error) => Promise.reject(error)
    );

    axios.interceptors.response.use(
      (response) => {
        // Log response time for performance monitoring
        const endTime = new Date();
        const duration = endTime.getTime() - (response.config.metadata?.startTime?.getTime() || 0);
        console.debug(`API call to ${response.config.url} took ${duration}ms`);
        return response;
      },
      (error) => Promise.reject(error)
    );
  }

  // Generate cache key from request config
  private getCacheKey(config: AxiosRequestConfig): string {
    const { method, url, params, data } = config;
    return `${method}-${url}-${JSON.stringify(params || {})}-${JSON.stringify(data || {})}`;
  }

  // Check if cache entry is valid
  private isCacheValid<T>(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp < entry.expiry;
  }

  // Request deduplication and caching
  async request<T = any>(config: AxiosRequestConfig, cacheTime?: number): Promise<T> {
    const cacheKey = this.getCacheKey(config);
    const effectiveCacheTime = cacheTime || this.defaultCacheTime;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      console.debug(`Cache hit for ${cacheKey}`);
      return cached.data;
    }

    // Check if request is already pending (deduplication)
    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      console.debug(`Request deduplication for ${cacheKey}`);
      return pending;
    }

    // Make the request
    const requestPromise = axios(config).then((response: AxiosResponse<T>) => {
      const data = response.data;
      
      // Cache the response
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        expiry: effectiveCacheTime,
      });

      // Clean up pending request
      this.pendingRequests.delete(cacheKey);
      
      return data;
    }).catch((error) => {
      // Clean up pending request on error
      this.pendingRequests.delete(cacheKey);
      throw error;
    });

    // Store pending request
    this.pendingRequests.set(cacheKey, requestPromise);

    return requestPromise;
  }

  // Batch multiple requests
  async batchRequest<T = any>(requests: Array<{
    config: AxiosRequestConfig;
    cacheTime?: number;
  }>): Promise<T[]> {
    const results = await Promise.allSettled(
      requests.map(req => this.request<T>(req.config, req.cacheTime))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        console.error(`Batch request ${index} failed:`, result.reason);
        throw result.reason;
      }
    });
  }

  // Clear cache
  clearCache(pattern?: string): void {
    if (pattern) {
      // Clear cache entries matching pattern
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      // Clear all cache
      this.cache.clear();
    }
  }

  // Get cache statistics
  getCacheStats(): { size: number; pendingRequests: number } {
    return {
      size: this.cache.size,
      pendingRequests: this.pendingRequests.size,
    };
  }

  // Preload data
  async preload<T = any>(config: AxiosRequestConfig, cacheTime?: number): Promise<void> {
    try {
      await this.request<T>(config, cacheTime);
      console.debug(`Preloaded data for ${config.url}`);
    } catch (error) {
      console.error(`Failed to preload data for ${config.url}:`, error);
    }
  }

  // Optimized GET request
  async get<T = any>(url: string, config?: AxiosRequestConfig, cacheTime?: number): Promise<T> {
    return this.request<T>({ ...config, method: 'GET', url }, cacheTime);
  }

  // Optimized POST request
  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    // POST requests are not cached by default
    return this.request<T>({ ...config, method: 'POST', url, data }, 0);
  }

  // Optimized PUT request
  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    // PUT requests are not cached by default
    return this.request<T>({ ...config, method: 'PUT', url, data }, 0);
  }

  // Optimized DELETE request
  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    // DELETE requests are not cached by default
    return this.request<T>({ ...config, method: 'DELETE', url }, 0);
  }
}

// Create singleton instance
export const optimizedApi = new OptimizedApiService();

// Export types
export type { CacheEntry };

// Added a placeholder comment to trigger GitHub PR detection
