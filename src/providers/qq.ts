import { BaseProvider, TokenResponse } from './base';
import { ProviderConfig, NormalizedUser } from '../types';

export default class QQProvider extends BaseProvider {
  name = 'qq';
  
  buildAuthURL(config: ProviderConfig, redirect_uri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: config.client_id,
      redirect_uri,
      response_type: 'code',
      scope: 'get_user_info',
      state,
    });
    
    return `https://graph.qq.com/oauth2.0/authorize?${params.toString()}`;
  }
  
  async exchangeCodeForToken(
    code: string,
    config: ProviderConfig,
    redirect_uri: string
  ): Promise<TokenResponse> {
    const url = new URL('https://graph.qq.com/oauth2.0/token');
    url.searchParams.set('grant_type', 'authorization_code');
    url.searchParams.set('client_id', config.client_id);
    url.searchParams.set('client_secret', config.client_secret);
    url.searchParams.set('code', code);
    url.searchParams.set('redirect_uri', redirect_uri);
    url.searchParams.set('fmt', 'json');
    
    const response = await this.fetchWithTimeout(url.toString(), { method: 'GET' });
    
    if (!response.ok) {
      throw new Error(`QQ token exchange failed: ${response.status}`);
    }
    
    const data = await response.json() as any;
    
    if (data.error) {
      throw new Error(`QQ API error: ${data.error} - ${data.error_description}`);
    }
    
    // Get OpenID
    const openidUrl = new URL('https://graph.qq.com/oauth2.0/me');
    openidUrl.searchParams.set('access_token', data.access_token);
    openidUrl.searchParams.set('fmt', 'json');
    
    const openidResponse = await this.fetchWithTimeout(openidUrl.toString(), { method: 'GET' });
    const openidData = await openidResponse.json() as any;
    
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      openid: openidData.openid,
      unionid: openidData.unionid,
    };
  }
  
  async getUserInfo(tokenResponse: TokenResponse, config: ProviderConfig): Promise<any> {
    const url = new URL('https://graph.qq.com/user/get_user_info');
    url.searchParams.set('access_token', tokenResponse.access_token);
    url.searchParams.set('oauth_consumer_key', config.client_id);
    url.searchParams.set('openid', tokenResponse.openid!);
    
    const response = await this.fetchWithTimeout(url.toString(), { method: 'GET' });
    
    if (!response.ok) {
      throw new Error(`QQ getUserInfo failed: ${response.status}`);
    }
    
    const data = await response.json() as any;
    
    if (data.ret !== 0) {
      throw new Error(`QQ API error: ${data.ret} - ${data.msg}`);
    }
    
    return {
      ...data,
      openid: tokenResponse.openid,
      unionid: tokenResponse.unionid,
    };
  }
  
  normalizeUser(raw: any): NormalizedUser {
    return {
      provider: 'qq',
      openid: raw.openid,
      unionid: raw.unionid,
      nickname: raw.nickname || 'QQ用户',
      avatar: raw.figureurl_qq_2 || raw.figureurl_qq_1 || raw.figureurl,
      gender: raw.gender === '男' ? 'male' : raw.gender === '女' ? 'female' : 'unknown',
      raw,
    };
  }
}
