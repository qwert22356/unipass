import { ProviderConfig, NormalizedUser } from '../types';

export interface OAuthProvider {
  name: string;
  
  /**
   * Build OAuth authorization URL
   */
  buildAuthURL(
    config: ProviderConfig,
    redirect_uri: string,
    state: string
  ): string;
  
  /**
   * Exchange authorization code for access token
   */
  exchangeCodeForToken(
    code: string,
    config: ProviderConfig,
    redirect_uri: string
  ): Promise<TokenResponse>;
  
  /**
   * Get user info from provider
   */
  getUserInfo(
    tokenResponse: TokenResponse,
    config: ProviderConfig
  ): Promise<any>;
  
  /**
   * Normalize user data to standard format
   */
  normalizeUser(raw: any): NormalizedUser;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  openid?: string;
  unionid?: string;
  [key: string]: any;
}

export abstract class BaseProvider implements OAuthProvider {
  abstract name: string;
  abstract buildAuthURL(config: ProviderConfig, redirect_uri: string, state: string): string;
  abstract exchangeCodeForToken(code: string, config: ProviderConfig, redirect_uri: string): Promise<TokenResponse>;
  abstract getUserInfo(tokenResponse: TokenResponse, config: ProviderConfig): Promise<any>;
  abstract normalizeUser(raw: any): NormalizedUser;
  
  protected async fetchWithTimeout(url: string, options: RequestInit, timeout: number = 30000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}
