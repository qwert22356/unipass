import { CONFIG } from '../config';

/**
 * Generate a cryptographically secure random nonce
 */
export function generateNonce(length: number = CONFIG.NONCE_LENGTH): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Encode OAuth state with CSRF protection
 */
export function encodeState(
  app_id: string,
  provider: string,
  redirect: string,
  nonce: string
): string {
  const state = {
    app_id,
    provider,
    redirect,
    nonce,
    timestamp: Date.now(),
  };
  return btoa(JSON.stringify(state));
}

/**
 * Decode and validate OAuth state
 */
export function decodeState(stateStr: string): {
  app_id: string;
  provider: string;
  redirect: string;
  nonce: string;
  timestamp: number;
} | null {
  try {
    const decoded = JSON.parse(atob(stateStr));
    
    // Validate required fields
    if (!decoded.app_id || !decoded.provider || !decoded.redirect || !decoded.nonce || !decoded.timestamp) {
      return null;
    }
    
    // Validate state expiration (10 minutes)
    if (Date.now() - decoded.timestamp > CONFIG.STATE_EXPIRATION) {
      return null;
    }
    
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Hash a string using SHA-256
 */
export async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a random string for various purposes
 */
export function randomString(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => chars[byte % chars.length]).join('');
}
