/**
 * Custom OAuth Error class
 */
export class OAuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'OAuthError';
  }
}

/**
 * Create a standard error JSON response
 */
export function createErrorResponse(
  error: string,
  description: string = '',
  statusCode: number = 400
): Response {
  return new Response(
    JSON.stringify({
      error,
      error_description: description,
      timestamp: new Date().toISOString(),
    }),
    {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}

/**
 * Redirect to frontend with error parameters
 */
export function redirectWithError(
  redirectUrl: string,
  error: string,
  description: string = ''
): Response {
  try {
    const url = new URL(redirectUrl);
    url.searchParams.set('error', error);
    if (description) {
      url.searchParams.set('error_description', description);
    }
    
    return Response.redirect(url.toString(), 302);
  } catch (e) {
    // Fallback if URL is invalid
    return createErrorResponse(error, description, 400);
  }
}

/**
 * Log error with context
 */
export function logError(context: string, error: any): void {
  console.error(`[ERROR] ${context}:`, {
    message: error.message || String(error),
    stack: error.stack,
    code: error.code,
  });
}

/**
 * Sanitize error message for external display
 */
export function sanitizeErrorMessage(error: any): string {
  if (error instanceof OAuthError) {
    return error.message;
  }
  
  // Don't expose internal error details
  return 'An unexpected error occurred';
}
