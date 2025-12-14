import { Env, AppConfig } from '../types';
import { CONFIG } from '../config';

/**
 * Get cached app configuration
 */
export async function getCachedAppConfig(
  env: Env,
  app_id: string
): Promise<AppConfig | null> {
  try {
    const cached = await env.APP_CACHE.get(`project:${app_id}`, 'json');
    return cached as AppConfig | null;
  } catch (error) {
    console.error('Cache read error:', error);
    return null;
  }
}

/**
 * Set cached app configuration
 */
export async function setCachedAppConfig(
  env: Env,
  app_id: string,
  config: AppConfig
): Promise<void> {
  try {
    await env.APP_CACHE.put(
      `project:${app_id}`,
      JSON.stringify(config),
      { expirationTtl: CONFIG.CACHE_TTL }
    );
  } catch (error) {
    console.error('Cache write error:', error);
  }
}

/**
 * Invalidate app cache
 */
export async function invalidateAppCache(
  env: Env,
  app_id: string
): Promise<void> {
  try {
    await env.APP_CACHE.delete(`project:${app_id}`);
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
}

/**
 * Get multiple cached configs
 */
export async function getCachedAppConfigs(
  env: Env,
  app_ids: string[]
): Promise<Map<string, AppConfig>> {
  const results = new Map<string, AppConfig>();
  
  await Promise.all(
    app_ids.map(async (app_id) => {
      const config = await getCachedAppConfig(env, app_id);
      if (config) {
        results.set(app_id, config);
      }
    })
  );
  
  return results;
}
