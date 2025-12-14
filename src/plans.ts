/**
 * Subscription Plan Configuration
 */
export interface PlanLimits {
  daily: number;
  monthly: number;
  apps: number | 'unlimited';
}

export type PlanType = 'free' | 'pro' | 'business' | 'enterprise';

export const PLAN_CONFIG: Record<PlanType, PlanLimits> = {
  free: {
    daily: 200,
    monthly: 6000,
    apps: 1,
  },
  pro: {
    daily: 5000,
    monthly: 150000,
    apps: 10,
  },
  business: {
    daily: 50000,
    monthly: 1500000,
    apps: 'unlimited',
  },
  enterprise: {
    daily: 100000,
    monthly: 3000000,
    apps: 'unlimited',
  },
} as const;

/**
 * Get the recommended plan when limit is exceeded
 */
export function getRecommendedPlan(currentPlan: PlanType): PlanType | null {
  const hierarchy: PlanType[] = ['free', 'pro', 'business', 'enterprise'];
  const currentIndex = hierarchy.indexOf(currentPlan);
  
  if (currentIndex === -1 || currentIndex === hierarchy.length - 1) {
    return null; // Already at highest plan
  }
  
  return hierarchy[currentIndex + 1];
}

/**
 * Check if a plan allows a certain number of apps
 */
export function canCreateApp(plan: PlanType, currentAppCount: number): boolean {
  const limits = PLAN_CONFIG[plan];
  
  if (limits.apps === 'unlimited') {
    return true;
  }
  
  return currentAppCount < limits.apps;
}
