import { Env } from './types';
import { Logger } from './utils/logger';
import { createErrorResponse, redirectWithError } from './utils/error';
import { encodeState, decodeState, generateNonce } from './utils/crypto';
import { getAppConfig } from './utils/supabase';
import { SupabaseClient } from './utils/supabase';
import { getProvider } from './providers/registry';
import { ERRORS } from './config';
import { getDeveloperPlan, checkLimits, incrementUsage } from './utils/usage';

/**
 * Handle /auth/login - Initiate OAuth flow
 */
export async function handleLogin(request: Request, env: Env, logger: Logger): Promise<Response> {
  const url = new URL(request.url);
  const app_id = url.searchParams.get('app_id');
  const provider = url.searchParams.get('provider');
  const redirect = url.searchParams.get('redirect');
  
  if (!app_id || !provider || !redirect) {
    logger.warn('Missing parameters in login request');
    return createErrorResponse(
      ERRORS.MISSING_PARAMS,
      'Required parameters: app_id, provider, redirect'
    );
  }
  
  logger.info(`Login initiated: app_id=${app_id}, provider=${provider}`);
  
  try {
    // Load app config
    const appConfig = await getAppConfig(env, app_id);
    
    if (!appConfig) {
      logger.warn(`App not found: ${app_id}`);
      return createErrorResponse(ERRORS.INVALID_APP, `App ${app_id} not found`, 404);
    }
    
    // Check rate limits BEFORE initiating OAuth
    const developerId = appConfig.developer_id;
    const developerPlan = await getDeveloperPlan(env, developerId);
    const limitCheck = await checkLimits(env, developerId, developerPlan);
    
    if (!limitCheck.allowed) {
      logger.warn(`Limit exceeded for developer ${developerId}: ${limitCheck.reason}`);
      
      return new Response(
        JSON.stringify({
          error: 'LIMIT_EXCEEDED',
          error_description: limitCheck.reason || 'Usage limit exceeded',
          current_plan: developerPlan,
          required_plan: limitCheck.required_plan,
          current_usage: limitCheck.current_usage,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
    
    logger.info(`Rate limit check passed for developer ${developerId} (plan: ${developerPlan})`);
    
    // Find provider config
    const providerConfig = appConfig.providers.find(p => p.provider === provider);
    
    if (!providerConfig) {
      logger.warn(`Provider not configured: ${provider} for app ${app_id}`);
      return createErrorResponse(
        ERRORS.INVALID_PROVIDER,
        `Provider ${provider} not configured for this app`,
        404
      );
    }
    
    if (!providerConfig.enabled) {
      logger.warn(`Provider disabled: ${provider} for app ${app_id}`);
      return createErrorResponse(
        ERRORS.PROVIDER_DISABLED,
        `Provider ${provider} is disabled`,
        403
      );
    }
    
    // Get provider implementation
    const providerImpl = getProvider(provider);
    
    if (!providerImpl) {
      logger.error(`Provider not supported: ${provider}`);
      return createErrorResponse(
        ERRORS.INVALID_PROVIDER,
        `Provider ${provider} is not supported`,
        500
      );
    }
    
    // Generate secure state
    const nonce = generateNonce();
    const state = encodeState(app_id, provider, redirect, nonce);
    
    // Build callback URL
    const callbackUrl = new URL('/auth/callback', request.url).toString();
    
    // Build OAuth URL
    const authUrl = providerImpl.buildAuthURL(providerConfig, callbackUrl, state);
    
    logger.info(`Redirecting to OAuth provider: ${provider}`);
    
    return Response.redirect(authUrl, 302);
    
  } catch (error: any) {
    logger.error('Login error:', error);
    return createErrorResponse(
      ERRORS.INTERNAL_ERROR,
      error.message || 'Internal server error',
      500
    );
  }
}

/**
 * Handle /auth/callback - Process OAuth callback
 */
export async function handleCallback(request: Request, env: Env, logger: Logger): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('auth_code') || url.searchParams.get('code');
  const stateStr = url.searchParams.get('state');
  
  if (!code || !stateStr) {
    logger.warn('Missing code or state in callback');
    return createErrorResponse(
      ERRORS.MISSING_PARAMS,
      'Required parameters: code, state'
    );
  }
  
  // Decode and validate state
  const state = decodeState(stateStr);
  
  if (!state) {
    logger.warn('Invalid or expired state');
    return createErrorResponse(
      ERRORS.INVALID_STATE,
      'State is invalid or expired'
    );
  }
  
  const { app_id, provider: providerName, redirect: redirectPath, nonce } = state;
  
  logger.info(`Callback received: app_id=${app_id}, provider=${providerName}`);
  
  try {
    // Load app config
    const appConfig = await getAppConfig(env, app_id);
    
    if (!appConfig) {
      logger.warn(`App not found: ${app_id}`);
      return createErrorResponse(ERRORS.INVALID_APP, `App ${app_id} not found`, 404);
    }
    
    // Find provider config
    const providerConfig = appConfig.providers.find(p => p.provider === providerName);
    
    if (!providerConfig) {
      logger.warn(`Provider not configured: ${providerName} for app ${app_id}`);
      return createErrorResponse(
        ERRORS.INVALID_PROVIDER,
        `Provider ${providerName} not configured`
      );
    }
    
    // Get provider implementation
    const provider = getProvider(providerName);
    
    if (!provider) {
      logger.error(`Provider not supported: ${providerName}`);
      return createErrorResponse(
        ERRORS.INVALID_PROVIDER,
        `Provider ${providerName} not supported`
      );
    }
    
    // Build callback URL (must match the one used in login)
    const callbackUrl = new URL('/auth/callback', request.url).toString();
    
    // Exchange code for token
    logger.info('Exchanging authorization code for access token...');
    const tokenResponse = await provider.exchangeCodeForToken(code, providerConfig, callbackUrl);
    
    // Get user info
    logger.info('Fetching user information from provider...');
    const rawUserInfo = await provider.getUserInfo(tokenResponse, providerConfig);
    
    // Normalize user data
    const normalizedUser = provider.normalizeUser(rawUserInfo);
    
    logger.info(`User authenticated: ${normalizedUser.provider}:${normalizedUser.openid}`);
    
    // Create/get user in Supabase
    const supabaseClient = new SupabaseClient(
      appConfig.supabase_url,
      appConfig.supabase_service_role
    );

    logger.info(`Attempting to create/get user in Supabase...`);
    logger.info(`Normalized user data:`, JSON.stringify(normalizedUser, null, 2));
    
    const { user, token } = await supabaseClient.getOrCreateUser(normalizedUser);
    
    logger.info(`User session created: user_id=${user.id}`);
    
    // ✅ INCREMENT USAGE - Only after successful OAuth
    const developerId = appConfig.developer_id;
    await incrementUsage(env, developerId);
    logger.info(`Usage incremented for developer ${developerId}`);
    
    // ✅ 重定向到开发者前端，携带用户信息
    const redirectUrl = new URL(redirectPath, appConfig.frontend_base_url);
    redirectUrl.searchParams.set('provider', providerName);
    redirectUrl.searchParams.set('user_id', user.id);
    redirectUrl.searchParams.set('openid', normalizedUser.openid);
    redirectUrl.searchParams.set('nickname', normalizedUser.nickname || '');
    redirectUrl.searchParams.set('avatar', normalizedUser.avatar || '');

    logger.info(`Redirecting to: ${redirectUrl.toString()}`);

    return Response.redirect(redirectUrl.toString(), 302);
    
  } catch (error: any) {
    logger.error('OAuth callback error:', error);
    
    // Try to redirect to frontend with error
    try {
      const appConfig = await getAppConfig(env, app_id);
      
      if (appConfig) {
        const frontendUrl = new URL(redirectPath, appConfig.frontend_base_url);
        return redirectWithError(
          frontendUrl.toString(),
          ERRORS.OAUTH_FAILED,
          error.message || 'Authentication failed'
        );
      }
    } catch (e) {
      // Ignore error and fall through to generic error response
    }
    
    return createErrorResponse(
      ERRORS.OAUTH_FAILED,
      error.message || 'Authentication failed',
      500
    );
  }
}
