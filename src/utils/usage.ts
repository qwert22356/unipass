import { Env, UsageStats, LimitCheckResult, Developer } from '../types';
import { PLAN_CONFIG, getRecommendedPlan, PlanType } from '../plans';

/**
 * Get current date in YYYYMMDD format
 */
function getCurrentDay(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Get current month in YYYYMM format
 */
function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

/**
 * Get KV key for daily usage
 */
function getDailyUsageKey(developerId: string): string {
  return `usage:${developerId}:day:${getCurrentDay()}`;
}

/**
 * Get KV key for monthly usage
 */
function getMonthlyUsageKey(developerId: string): string {
  return `usage:${developerId}:month:${getCurrentMonth()}`;
}

/**
 * Get current usage stats for a developer
 */
export async function getUsageStats(
  env: Env,
  developerId: string
): Promise<UsageStats> {
  const dailyKey = getDailyUsageKey(developerId);
  const monthlyKey = getMonthlyUsageKey(developerId);
  
  const [dailyUsage, monthlyUsage] = await Promise.all([
    env.APP_CACHE.get(dailyKey),
    env.APP_CACHE.get(monthlyKey),
  ]);
  
  return {
    daily: dailyUsage ? parseInt(dailyUsage, 10) : 0,
    monthly: monthlyUsage ? parseInt(monthlyUsage, 10) : 0,
  };
}

/**
 * Increment usage counters
 */
export async function incrementUsage(
  env: Env,
  developerId: string
): Promise<void> {
  const dailyKey = getDailyUsageKey(developerId);
  const monthlyKey = getMonthlyUsageKey(developerId);
  
  // Get current values
  const stats = await getUsageStats(env, developerId);
  
  // Increment
  const newDaily = stats.daily + 1;
  const newMonthly = stats.monthly + 1;
  
  // Calculate TTL (expire at end of day/month)
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setUTCHours(23, 59, 59, 999);
  const dailyTTL = Math.floor((endOfDay.getTime() - now.getTime()) / 1000);
  
  const endOfMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999);
  const monthlyTTL = Math.floor((endOfMonth.getTime() - now.getTime()) / 1000);
  
  // Store with expiration
  await Promise.all([
    env.APP_CACHE.put(dailyKey, String(newDaily), { expirationTtl: dailyTTL }),
    env.APP_CACHE.put(monthlyKey, String(newMonthly), { expirationTtl: monthlyTTL }),
  ]);
}

/**
 * Check if developer has exceeded their limits
 */
export async function checkLimits(
  env: Env,
  developerId: string,
  plan: PlanType
): Promise<LimitCheckResult> {
  const limits = PLAN_CONFIG[plan];
  const usage = await getUsageStats(env, developerId);
  
  // Check daily limit
  if (usage.daily >= limits.daily) {
    return {
      allowed: false,
      reason: 'Daily limit exceeded',
      required_plan: getRecommendedPlan(plan) || undefined,
      current_usage: usage,
    };
  }
  
  // Check monthly limit
  if (usage.monthly >= limits.monthly) {
    return {
      allowed: false,
      reason: 'Monthly limit exceeded',
      required_plan: getRecommendedPlan(plan) || undefined,
      current_usage: usage,
    };
  }
  
  return {
    allowed: true,
    current_usage: usage,
  };
}

/**
 * Get developer plan from cache or Supabase
 */
export async function getDeveloperPlan(
  env: Env,
  developerId: string
): Promise<PlanType> {
  // Try cache first
  const cacheKey = `developer:${developerId}:plan`;
  const cached = await env.APP_CACHE.get(cacheKey);
  
  if (cached && ['free', 'pro', 'business', 'enterprise'].includes(cached)) {
    return cached as PlanType;
  }
  
  // Fetch from Supabase
  try {
    const response = await fetch(
      `${env.MASTER_SUPABASE_URL}/rest/v1/developers?id=eq.${developerId}`,
      {
        headers: {
          'Authorization': `Bearer ${env.MASTER_SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': env.MASTER_SUPABASE_SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (response.ok) {
      const data = await response.json() as any;
      const developers = data as Developer[];
      
      if (developers.length > 0) {
        const plan = developers[0].plan || 'free';
        
        // Cache for 5 minutes
        await env.APP_CACHE.put(cacheKey, plan, { expirationTtl: 300 });
        
        return plan as PlanType;
      }
    }
  } catch (error) {
    console.error('Error fetching developer plan:', error);
  }
  
  // Default to free plan
  return 'free';
}
