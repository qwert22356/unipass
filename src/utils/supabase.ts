import { Env, AppConfig, Project, OAuthCredential, NormalizedUser, SupabaseUser } from '../types';
import { getCachedAppConfig, setCachedAppConfig } from './cache';
import { CONFIG } from '../config';

/**
 * Supabase Client for Admin API
 */
export class SupabaseClient {
  private supabaseUrl: string;
  private serviceRoleKey: string;
  
  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.supabaseUrl = supabaseUrl.replace(/\/$/, '');
    this.serviceRoleKey = serviceRoleKey;
  }
  
  /**
   * Fetch with timeout and auth headers
   */
  async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.supabaseUrl}${path}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);
    
    try {
      // Merge headers: custom headers override defaults
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'apikey': this.serviceRoleKey,
        'Authorization': `Bearer ${this.serviceRoleKey}`,
      };
      
      // Apply custom headers (will override defaults if provided)
      if (options.headers) {
        Object.entries(options.headers).forEach(([key, value]) => {
          if (value !== undefined) {
            headers[key] = String(value);
          }
        });
      }
      
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
  
  /**
   * Find user by email
   */
  async findUserByEmail(email: string): Promise<SupabaseUser | null> {
    const response = await this.fetch(`/auth/v1/admin/users`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch users: ${response.status}`);
    }
    
    const data = await response.json() as any;
    const users = data.users || [];
    
    return users.find((u: any) => u.email === email) || null;
  }
  
  /**
   * Create a new user
   */
  async createUser(email: string, userMetadata: Record<string, any>): Promise<SupabaseUser> {
    const nickname = userMetadata.nickname || "用户";
    const avatar = userMetadata.avatar || null;
    
    const response = await this.fetch('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email,
        email_confirm: true,
        // ★ 统一写入 user_metadata，Dashboard 会显示
        user_metadata: {
          avatar_url: avatar,      // ★ 这一行让 Supabase 显示头像
          picture: avatar,         // ★ OAuth 标准字段
          full_name: nickname,     // ★ Dashboard 显示 nickname
          nickname,
          openid: userMetadata.openid,
          provider: userMetadata.provider,
          oauth_raw: userMetadata.raw
        }
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create user: ${response.status} - ${error}`);
    }
    
    return await response.json();
  }
  
  /**
   * Generate session token for user
   */
  /* async generateSessionToken(email: string): Promise<string> {
    const response = await this.fetch('/auth/v1/admin/generate_link', {
      method: 'POST',
      body: JSON.stringify({
        type: 'magiclink',
        email,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to generate session: ${response.status} - ${error}`);
    }
    
    const data = await response.json() as any;

    console.log('Generate link response:', JSON.stringify(data, null, 2)); 

    // ✅ 修复：action_link 在顶层
    const actionLink = data.action_link;

    if (!actionLink) {
      console.error('Full response:', JSON.stringify(data, null, 2));
      throw new Error('No action_link in response');
    }
    
    // Extract access_token from the magic link
    const url = new URL(data.properties.action_link);
    const token = url.searchParams.get('access_token') || url.hash.match(/access_token=([^&]+)/)?.[1];
    
    if (!token) {
      throw new Error('No access token in response');
    }
    
    return token;
  } */
  
  /**
   * Get or create user from normalized OAuth data
   */
  async getOrCreateUser(normalizedUser: NormalizedUser): Promise<{ user: SupabaseUser; token: string }> {
    // Generate fake but unique email
    const email = `${normalizedUser.provider}_${normalizedUser.unionid || normalizedUser.openid}@oauth.fake`;
    
    let user = await this.findUserByEmail(email);
    
    if (!user) {
      user = await this.createUser(email, {
        provider: normalizedUser.provider,
        openid: normalizedUser.openid,
        unionid: normalizedUser.unionid,
        nickname: normalizedUser.nickname,
        avatar: normalizedUser.avatar,
        gender: normalizedUser.gender,
        oauth_raw: normalizedUser.raw,
      });
    }
    
    // const token = await this.generateSessionToken(email);
    
    // return { user, token };

    return { 
      user, 
      token: user.id  // 返回 user_id 作为标识
    };
  }
}

/**
 * Fetch app configuration from master Supabase
 */
export async function getAppConfig(env: Env, app_id: string): Promise<AppConfig | null> {
  // Try cache first
  const cached = await getCachedAppConfig(env, app_id);
  if (cached) {
    return cached;
  }
  
  // Fetch from master Supabase
  const masterClient = new SupabaseClient(
    env.MASTER_SUPABASE_URL,
    env.MASTER_SUPABASE_SERVICE_ROLE_KEY
  );
  
  // Get project
  const projectResponse = await masterClient.fetch(`/rest/v1/projects?id=eq.${app_id}`, {
    headers: {
      'Accept': 'application/json',
    },
  });
  
  if (!projectResponse.ok) {
    return null;
  }
  
  const projects: Project[] = await projectResponse.json();
  
  if (projects.length === 0) {
    return null;
  }
  
  const project = projects[0];
  
  // Get OAuth credentials
  const credentialsResponse = await masterClient.fetch(
    `/rest/v1/oauth_credentials?project_id=eq.${app_id}&enabled=eq.true`,
    {
      headers: {
        'Accept': 'application/json',
      },
    }
  );
  
  if (!credentialsResponse.ok) {
    return null;
  }
  
  const credentials: OAuthCredential[] = await credentialsResponse.json();
  
  const config: AppConfig = {
    project_id: project.id,
    developer_id: project.owner_id,
    frontend_base_url: project.frontend_base_url,
    supabase_url: project.supabase_url,
    supabase_service_role: project.supabase_service_role_key,
    providers: credentials.map(c => ({
      provider: c.provider,
      client_id: c.client_id,
      client_secret: c.client_secret,
      extra: c.extra,
      enabled: c.enabled,
    })),
  };
  
  // Cache it
  await setCachedAppConfig(env, app_id, config);
  
  return config;
}
