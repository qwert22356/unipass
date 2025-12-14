import { BaseProvider, TokenResponse } from './base';
import { ProviderConfig, NormalizedUser } from '../types';

export default class WeChatProvider extends BaseProvider {
  name = 'wechat';
  
  buildAuthURL(config: ProviderConfig, redirect_uri: string, state: string): string {
    const params = new URLSearchParams({
      appid: config.client_id,
      redirect_uri,
      response_type: 'code',
      scope: 'snsapi_userinfo',
      state,
    });
    
    return `https://open.weixin.qq.com/connect/oauth2/authorize?${params.toString()}#wechat_redirect`;
  }
  
  async exchangeCodeForToken(
    code: string,
    config: ProviderConfig,
    redirect_uri: string
  ): Promise<TokenResponse> {
    const url = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
    url.searchParams.set('appid', config.client_id);
    url.searchParams.set('secret', config.client_secret);
    url.searchParams.set('code', code);
    url.searchParams.set('grant_type', 'authorization_code');
    
    const response = await this.fetchWithTimeout(url.toString(), { method: 'GET' });
    
    if (!response.ok) {
      throw new Error(`WeChat token exchange failed: ${response.status}`);
    }
    
    const data = await response.json() as any;
    
    if (data.errcode) {
      throw new Error(`WeChat API error: ${data.errcode} - ${data.errmsg}`);
    }
    
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      openid: data.openid,
      unionid: data.unionid,
    };
  }
  
  async getUserInfo(tokenResponse: TokenResponse, config: ProviderConfig): Promise<any> {
    const url = new URL('https://api.weixin.qq.com/sns/userinfo');
    url.searchParams.set('access_token', tokenResponse.access_token);
    url.searchParams.set('openid', tokenResponse.openid!);
    url.searchParams.set('lang', 'zh_CN');
    
    const response = await this.fetchWithTimeout(url.toString(), { method: 'GET' });
    
    if (!response.ok) {
      throw new Error(`WeChat getUserInfo failed: ${response.status}`);
    }
    
    const data = await response.json() as any;
    
    if (data.errcode) {
      throw new Error(`WeChat API error: ${data.errcode} - ${data.errmsg}`);
    }
    
    return data;
  }
  
  normalizeUser(raw: any): NormalizedUser {
    return {
      provider: 'wechat',
      openid: raw.openid,
      unionid: raw.unionid,
      nickname: raw.nickname || '微信用户',
      avatar: raw.headimgurl,
      gender: raw.sex === 1 ? 'male' : raw.sex === 2 ? 'female' : 'unknown',
      raw,
    };
  }
}
