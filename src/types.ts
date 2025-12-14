export interface Env {
  APP_CACHE: KVNamespace;
  MASTER_SUPABASE_URL: string;
  MASTER_SUPABASE_SERVICE_ROLE_KEY: string;
  WORKER_ENV?: string;
  LOG_LEVEL?: string;
}

export interface Developer {
  id: string;
  email: string;
  plan: 'free' | 'pro' | 'business' | 'enterprise';
  created_at: string;
}

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  frontend_base_url: string;
  supabase_url: string;
  supabase_service_role_key: string;
  created_at: string;
}

export interface OAuthCredential {
  id: string;
  project_id: string;
  provider: string;
  client_id: string;
  client_secret: string;
  extra: {
    alipay_public_key?: string;
    [key: string]: any;
  };
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppConfig {
  project_id: string;
  developer_id: string;
  frontend_base_url: string;
  supabase_url: string;
  supabase_service_role: string;
  providers: ProviderConfig[];
}

export interface ProviderConfig {
  provider: string;
  client_id: string;
  client_secret: string; // 对于支付宝：这是 RSA 私钥
  extra?: {
    alipay_public_key?: string;  // 支付宝公钥（仅支付宝需要）
    [key: string]: any;
  };
  enabled: boolean;
}

/**
 * 添加 Provider 请求体（通用）
 */
 export interface AddProviderRequest {
  provider: string;
  client_id: string;
  client_secret?: string;  // 可选，因为支付宝用 private_key
  enabled?: boolean;
  extra?: Record<string, any>;
}

/**
 * 添加支付宝 Provider 请求体（特定）
 */
export interface AddAlipayProviderRequest {
  provider: 'alipay';
  client_id: string;
  private_key: string;  // RSA 私钥
  alipay_public_key: string;  // 支付宝公钥
  enabled?: boolean;
}

export interface OAuthState {
  app_id: string;
  provider: string;
  redirect: string;
  nonce: string;
  timestamp: number;
}

export interface NormalizedUser {
  provider: string;
  openid: string;
  unionid?: string;
  nickname: string;
  avatar?: string;
  gender?: string;
  raw?: any;
}

export interface SupabaseUser {
  id: string;
  email: string;
  user_metadata: Record<string, any>;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: SupabaseUser;
}

export interface UsageStats {
  daily: number;
  monthly: number;
}

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  required_plan?: string;
  current_usage?: UsageStats;
}
