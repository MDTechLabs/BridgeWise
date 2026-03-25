import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';
import { ApiKeyVaultService } from './api-key-vault.service';

interface SecureRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  apiKeyId?: string;
  contentType?: 'application/json' | 'application/x-www-form-urlencoded';
}

interface SecureRequestResponse {
  statusCode: number;
  headers: Record<string, any>;
  body: any;
}

/**
 * Secure HTTP Client Service
 * Makes authenticated requests using keys from the vault
 * Prevents key exposure and manages request security
 */
@Injectable()
export class SecureHttpClientService {
  private readonly logger = new Logger(SecureHttpClientService.name);

  constructor(private readonly apiKeyVault: ApiKeyVaultService) {}

  /**
   * Make a secure HTTP request with API key from vault
   * @param url Target URL
   * @param options Request options including apiKeyId
   * @returns Response promise
   */
  async request(
    url: string,
    options: SecureRequestOptions = {},
  ): Promise<SecureRequestResponse> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = 30000,
      apiKeyId,
      contentType = 'application/json',
    } = options;

    // Validate URL to prevent SSRF attacks
    if (!this.isValidUrl(url)) {
      throw new Error('Invalid URL provided');
    }

    try {
      // Add API key from vault if specified
      const finalHeaders = { ...headers };
      if (apiKeyId) {
        const apiKey = this.apiKeyVault.retrieveKey(apiKeyId);
        finalHeaders['X-API-Key'] = apiKey;
        finalHeaders['Authorization'] = `Bearer ${apiKey}`;
      }

      // Set content type
      finalHeaders['Content-Type'] = contentType;
      finalHeaders['User-Agent'] = 'BridgeWise/1.0';

      return await this.executeRequest(url, {
        method,
        headers: finalHeaders,
        body,
        timeout,
      });
    } catch (error) {
      this.logger.error(
        `Secure request failed for ${method} ${url}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Execute the actual HTTP request
   */
  private async executeRequest(
    url: string,
    options: {
      method: string;
      headers: Record<string, string>;
      body?: any;
      timeout: number;
    },
  ): Promise<SecureRequestResponse> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isSecure = urlObj.protocol === 'https:';
      const client = isSecure ? https : http;

      const requestOptions = {
        method: options.method,
        headers: options.headers,
        timeout: options.timeout,
      };

      const request = client.request(urlObj, requestOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            let parsedBody: any;
            try {
              parsedBody =
                data &&
                res.headers['content-type']?.includes('application/json')
                  ? JSON.parse(data)
                  : data;
            } catch {
              parsedBody = data;
            }

            resolve({
              statusCode: res.statusCode || 200,
              headers: res.headers,
              body: parsedBody,
            });
          } catch (error) {
            reject(error);
          }
        });
      });

      request.on('error', (error) => {
        reject(error);
      });

      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });

      if (options.body) {
        const bodyString =
          typeof options.body === 'string'
            ? options.body
            : JSON.stringify(options.body);
        request.write(bodyString);
      }

      request.end();
    });
  }

  /**
   * Validate URL to prevent SSRF
   */
  private isValidUrl(urlString: string): boolean {
    try {
      const url = new URL(urlString);

      // Disallow internal IPs
      const hostname = url.hostname;
      const internalPatterns = [
        /^localhost$/,
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[01])\./,
        /^192\.168\./,
        /^0\.0\.0\.0$/,
        /^::1$/,
        /^fc[0-9a-f]{2}:/i,
      ];

      for (const pattern of internalPatterns) {
        if (pattern.test(hostname)) {
          this.logger.warn(`SSRF attempt detected: ${hostname}`);
          return false;
        }
      }

      // Only allow http and https
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Make a GET request
   */
  async get(url: string, options?: SecureRequestOptions) {
    return this.request(url, { ...options, method: 'GET' });
  }

  /**
   * Make a POST request
   */
  async post(url: string, body?: any, options?: SecureRequestOptions) {
    return this.request(url, { ...options, method: 'POST', body });
  }

  /**
   * Make a PUT request
   */
  async put(url: string, body?: any, options?: SecureRequestOptions) {
    return this.request(url, { ...options, method: 'PUT', body });
  }

  /**
   * Make a DELETE request
   */
  async delete(url: string, options?: SecureRequestOptions) {
    return this.request(url, { ...options, method: 'DELETE' });
  }

  /**
   * Make a PATCH request
   */
  async patch(url: string, body?: any, options?: SecureRequestOptions) {
    return this.request(url, { ...options, method: 'PATCH', body });
  }
}
