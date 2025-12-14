import { BaseProvider, TokenResponse } from './base';
import { ProviderConfig, NormalizedUser } from '../types';

/**
 * Weibo OAuth Provider
 * 
 * 使用方法：
 * 1. 在 registry.ts 中导入并注册此 Provider
 * 2. 在数据库中为项目添加微博凭证
 */
export default class WeiboProvider extends BaseProvider {
  name = 'weibo';
  
  buildAuthURL(config: ProviderConfig, redirect_uri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: config.client_id,
      redirect_uri,
      response_type: 'code',
      state,
    });
    
    return `https://api.weibo.com/oauth2/authorize?${params.toString()}`;
  }
  
  async exchangeCodeForToken(
    code: string,
    config: ProviderConfig,
    redirect_uri: string
  ): Promise<TokenResponse> {
    const url = 'https://api.weibo.com/oauth2/access_token';
    
    const body = new URLSearchParams({
      client_id: config.client_id,
      client_secret: config.client_secret,
      grant_type: 'authorization_code',
      code,
      redirect_uri,
    });
    
    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    
    if (!response.ok) {
      throw new Error(`Weibo token exchange failed: ${response.status}`);
    }
    
    const data = await response.json() as any;
    
    if (data.error) {
      throw new Error(`Weibo API error: ${data.error} - ${data.error_description}`);
    }
    
    return {
      access_token: data.access_token,
      expires_in: data.expires_in,
      openid: data.uid,
    };
  }
  
  async getUserInfo(tokenResponse: TokenResponse, config: ProviderConfig): Promise<any> {
    const url = 'https://api.weibo.com/2/users/show.json';
    const params = new URLSearchParams({
      access_token: tokenResponse.access_token,
      uid: tokenResponse.openid!,
    });
    
    const response = await this.fetchWithTimeout(`${url}?${params.toString()}`, {
      method: 'GET',
    });
    
    if (!response.ok) {
      throw new Error(`Weibo getUserInfo failed: ${response.status}`);
    }
    
    const data = await response.json() as any;
    
    if (data.error) {
      throw new Error(`Weibo API error: ${data.error} - ${data.error_description}`);
    }
    
    return data;
  }
  
  normalizeUser(raw: any): NormalizedUser {
    return {
      provider: 'weibo',
      openid: raw.id || raw.idstr,
      nickname: raw.screen_name || '微博用户',
      avatar: raw.avatar_large || raw.avatar_hd || raw.profile_image_url,
      gender: raw.gender === 'm' ? 'male' : raw.gender === 'f' ? 'female' : 'unknown',
      raw,
    };
  }
}
