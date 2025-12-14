import { BaseProvider, TokenResponse } from './base';
import { ProviderConfig, NormalizedUser } from '../types';

export default class DingTalkProvider extends BaseProvider {
  name = 'dingtalk';
  
  buildAuthURL(config: ProviderConfig, redirect_uri: string, state: string): string {
    const params = new URLSearchParams({
      appid: config.client_id,
      redirect_uri,
      response_type: 'code',
      scope: 'openid',
      state,
    });
    
    return `https://login.dingtalk.com/oauth2/auth?${params.toString()}`;
  }
  
  async exchangeCodeForToken(
    code: string,
    config: ProviderConfig,
    redirect_uri: string
  ): Promise<TokenResponse> {
    const url = 'https://api.dingtalk.com/v1.0/oauth2/userAccessToken';
    
    const body = {
      clientId: config.client_id,
      clientSecret: config.client_secret,
      code,
      grantType: 'authorization_code',
    };
    
    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      throw new Error(`DingTalk token exchange failed: ${response.status}`);
    }
    
    const data = await response.json() as any;
    
    if (!data.accessToken) {
      throw new Error(`DingTalk API error: ${JSON.stringify(data)}`);
    }
    
    return {
      access_token: data.accessToken,
      refresh_token: data.refreshToken,
      expires_in: data.expireIn,
    };
  }
  
  async getUserInfo(tokenResponse: TokenResponse, config: ProviderConfig): Promise<any> {
    const url = 'https://api.dingtalk.com/v1.0/contact/users/me';
    
    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'x-acs-dingtalk-access-token': tokenResponse.access_token,
      },
    });
    
    if (!response.ok) {
      throw new Error(`DingTalk getUserInfo failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    return data;
  }
  
  normalizeUser(raw: any): NormalizedUser {
    return {
      provider: 'dingtalk',
      openid: raw.openId || raw.unionId,
      unionid: raw.unionId,
      nickname: raw.nick || raw.name || '钉钉用户',
      avatar: raw.avatarUrl,
      raw,
    };
  }
}
