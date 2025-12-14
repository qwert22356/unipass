import { BaseProvider, TokenResponse } from './base';
import { ProviderConfig, NormalizedUser } from '../types';

export default class DouyinProvider extends BaseProvider {
  name = 'douyin';
  
  buildAuthURL(config: ProviderConfig, redirect_uri: string, state: string): string {
    const params = new URLSearchParams({
      client_key: config.client_id,
      redirect_uri,
      response_type: 'code',
      scope: 'user_info',
      state,
    });
    
    return `https://open.douyin.com/platform/oauth/connect?${params.toString()}`;
  }
  
  async exchangeCodeForToken(
    code: string,
    config: ProviderConfig,
    redirect_uri: string
  ): Promise<TokenResponse> {
    const url = 'https://open.douyin.com/oauth/access_token/';
    
    const body = {
      client_key: config.client_id,
      client_secret: config.client_secret,
      code,
      grant_type: 'authorization_code',
    };
    
    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      throw new Error(`Douyin token exchange failed: ${response.status}`);
    }
    
    const data = await response.json() as any;
    
    if (data.data.error_code !== 0) {
      throw new Error(`Douyin API error: ${data.data.error_code} - ${data.data.description}`);
    }
    
    return {
      access_token: data.data.access_token,
      refresh_token: data.data.refresh_token,
      expires_in: data.data.expires_in,
      openid: data.data.open_id,
    };
  }
  
  async getUserInfo(tokenResponse: TokenResponse, config: ProviderConfig): Promise<any> {
    const url = 'https://open.douyin.com/oauth/userinfo/';
    
    const params = new URLSearchParams({
      access_token: tokenResponse.access_token,
      open_id: tokenResponse.openid!,
    });
    
    const response = await this.fetchWithTimeout(`${url}?${params.toString()}`, {
      method: 'GET',
    });
    
    if (!response.ok) {
      throw new Error(`Douyin getUserInfo failed: ${response.status}`);
    }
    
    const data = await response.json() as any;
    
    if (data.data.error_code !== 0) {
      throw new Error(`Douyin API error: ${data.data.error_code} - ${data.data.description}`);
    }
    
    return data.data;
  }
  
  normalizeUser(raw: any): NormalizedUser {
    return {
      provider: 'douyin',
      openid: raw.open_id || raw.openid,
      unionid: raw.union_id,
      nickname: raw.nickname || '抖音用户',
      avatar: raw.avatar,
      gender: raw.gender === 1 ? 'male' : raw.gender === 2 ? 'female' : 'unknown',
      raw,
    };
  }
}
