export const CONFIG = {
  // Cache TTL (seconds)
  CACHE_TTL: 300,
  
  // State expiration (10 minutes)
  STATE_EXPIRATION: 600000,
  
  // API timeouts (ms)
  TIMEOUT: 30000,
  
  // OAuth callback base
  CALLBACK_PATH: '/auth/callback',
  
  // Nonce length
  NONCE_LENGTH: 32,
} as const;

export const ERRORS = {
  INVALID_APP: 'invalid_app',
  INVALID_PROVIDER: 'invalid_provider',
  PROVIDER_DISABLED: 'provider_disabled',
  INVALID_STATE: 'invalid_state',
  OAUTH_FAILED: 'oauth_failed',
  USER_CREATE_FAILED: 'user_create_failed',
  MISSING_PARAMS: 'missing_params',
  SUPABASE_ERROR: 'supabase_error',
  INTERNAL_ERROR: 'internal_error',
  NOT_FOUND: 'not_found',
} as const;

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
} as const;
