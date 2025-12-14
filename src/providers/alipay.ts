import { BaseProvider, TokenResponse } from './base';
import { ProviderConfig, NormalizedUser } from '../types';

/**
 * Alipay OAuth Provider
 * 
 * 文档：https://opendocs.alipay.com/open/284/105325
 * 
 * 注意：支付宝使用 RSA2 签名，client_secret 应该是 RSA 私钥（PKCS8 格式）
 */
export default class AlipayProvider extends BaseProvider {
  name = 'alipay';
  
  buildAuthURL(config: ProviderConfig, redirect_uri: string, state: string): string {
    const params = new URLSearchParams({
      app_id: config.client_id,
      scope: 'auth_user',
      redirect_uri,
      state,
    });
    
    return `https://openauth.alipay.com/oauth2/publicAppAuthorize.htm?${params.toString()}`;
  }
  
  async exchangeCodeForToken(
    code: string,
    config: ProviderConfig,
    redirect_uri: string
  ): Promise<TokenResponse> {
    const privateKey = config.client_secret;
    
    const params: Record<string, string> = {
      app_id: config.client_id,
      method: 'alipay.system.oauth.token',
      format: 'JSON',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: this.getAlipayTimestamp(),
      version: '1.0',
      grant_type: 'authorization_code',  // ✅ 加这行
      code: code,                         // ✅ 加这行
    };

    const sign = await this.signRequest(params, privateKey);
    
    const url = new URL('https://openapi.alipay.com/gateway.do');
    Object.entries({ ...params, sign }).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const response = await this.fetchWithTimeout(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
    });

    if (!response.ok) {
      throw new Error(`Alipay token request failed: ${response.status}`);
    }

    const data = await response.json() as any;

    if (data.error_response) {
      throw new Error(
        `Alipay error: ${data.error_response.sub_msg || data.error_response.msg}`
      );
    }

    const tokenData = data.alipay_system_oauth_token_response;
    
    return {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: parseInt(tokenData.expires_in, 10),
      user_id: tokenData.user_id,
    };
  }
  
  async getUserInfo(tokenResponse: TokenResponse, config: ProviderConfig): Promise<any> {
    const privateKey = config.client_secret;

    const params: Record<string, string> = {
      app_id: config.client_id,
      method: 'alipay.user.info.share',
      format: 'JSON',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: this.getAlipayTimestamp(),
      version: '1.0',
      auth_token: tokenResponse.access_token,
    };

    const sign = await this.signRequest(params, privateKey);

    const url = new URL('https://openapi.alipay.com/gateway.do');
    Object.entries({ ...params, sign }).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const response = await this.fetchWithTimeout(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
    });

    if (!response.ok) {
      throw new Error(`Alipay user info request failed: ${response.status}`);
    }

    const data = await response.json() as any;

    if (data.error_response) {
      throw new Error(
        `Alipay error: ${data.error_response.sub_msg || data.error_response.msg}`
      );
    }

    return data.alipay_user_info_share_response;
  }
  
  normalizeUser(raw: any): NormalizedUser {
    const openid = raw.user_id;   // 先取出来
    return {
      provider: 'alipay',
      openid,
      nickname: raw.nick_name || `支付宝用户${openid.slice(-4)}`, // ★正确拼接
      avatar: raw.avatar || '',
      gender: raw.gender === 'M' ? 'male' : raw.gender === 'F' ? 'female' : undefined,
      raw: raw,
    };
  }

  /**
   * RSA-SHA256 签名（支付宝特有）
   */
  private async signRequest(params: Record<string, string>, privateKeyPem: string): Promise<string> {
    const sortedKeys = Object.keys(params).sort();
    const signString = sortedKeys
      .map(key => `${key}=${params[key]}`)
      .join('&');

    const cryptoKey = await this.importPrivateKey(privateKeyPem);

    const encoder = new TextEncoder();
    const data = encoder.encode(signString);

    const signature = await crypto.subtle.sign(
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: { name: 'SHA-256' },
      },
      cryptoKey,
      data
    );

    return this.arrayBufferToBase64(signature);
  }

  /**
   * 导入 RSA 私钥（PKCS8 格式）
   */
  private async importPrivateKey(privateKeyPem: string): Promise<CryptoKey> {
    const pemContents = privateKeyPem
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\s/g, '');

    const binaryDer = atob(pemContents);
    const binaryArray = new Uint8Array(binaryDer.length);
    for (let i = 0; i < binaryDer.length; i++) {
      binaryArray[i] = binaryDer.charCodeAt(i);
    }

    return await crypto.subtle.importKey(
      'pkcs8',
      binaryArray,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: { name: 'SHA-256' },
      },
      false,
      ['sign']
    );
  }

  /**
   * 验证支付宝回调签名
   */
  async verifySignature(
    params: Record<string, string>,
    signature: string,
    alipayPublicKey: string
  ): Promise<boolean> {
    try {
      const { sign, sign_type, ...verifyParams } = params;

      const sortedKeys = Object.keys(verifyParams).sort();
      const signString = sortedKeys
        .map(key => `${key}=${verifyParams[key]}`)
        .join('&');

      const publicKey = await this.importPublicKey(alipayPublicKey);

      const encoder = new TextEncoder();
      const data = encoder.encode(signString);
      const signatureBytes = this.base64ToArrayBuffer(signature);

      const isValid = await crypto.subtle.verify(
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: { name: 'SHA-256' },
        },
        publicKey,
        signatureBytes,
        data
      );

      return isValid;
    } catch (error) {
      console.error('Alipay signature verification failed:', error);
      return false;
    }
  }

  /**
   * 导入支付宝 RSA 公钥
   */
  private async importPublicKey(publicKeyPem: string): Promise<CryptoKey> {
    const pemContents = publicKeyPem
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s/g, '');

    const binaryDer = atob(pemContents);
    const binaryArray = new Uint8Array(binaryDer.length);
    for (let i = 0; i < binaryDer.length; i++) {
      binaryArray[i] = binaryDer.charCodeAt(i);
    }

    return await crypto.subtle.importKey(
      'spki',
      binaryArray,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: { name: 'SHA-256' },
      },
      false,
      ['verify']
    );
  }

  /**
   * ArrayBuffer 转 Base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Base64 转 ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * 获取支付宝时间戳格式
   * 格式：yyyy-MM-dd HH:mm:ss
   */
  private getAlipayTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}