import { Env } from './types';
import { Logger } from './utils/logger';
import { createErrorResponse } from './utils/error';
import { handleLogin, handleCallback } from './router';
import { listProviders } from './providers/registry';
import {
  handleCreateProject,
  handleUpdateProject,
  handleGetProjects,
  handleDeleteProject,
  handleAddProvider,
  handleGetProviders,
} from './admin/projects';

/**
 * UniPass OAuth Gateway
 * Multi-tenant OAuth authentication gateway for Chinese social platforms
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const logger = new Logger(env.LOG_LEVEL || 'info');
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }
    
    try {
      // Health check endpoint
      if (url.pathname === '/' || url.pathname === '/health') {
        return new Response(
          JSON.stringify({
            status: 'ok',
            service: 'UniPass OAuth Gateway',
            version: '1.0.0',
            providers: listProviders(),
            endpoints: {
              login: '/auth/login?app_id={APP_ID}&provider={PROVIDER}&redirect={PATH}',
              callback: '/auth/callback (automatic)',
            },
            timestamp: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          }
        );
      }
      
      // Login endpoint - initiate OAuth flow
      if (url.pathname === '/auth/login') {
        const response = await handleLogin(request, env, logger);
        // Clone headers and add CORS headers (avoid immutable headers error)
        const newHeaders = new Headers(response.headers);
        Object.entries(corsHeaders).forEach(([key, value]) => {
          newHeaders.set(key, value);
        });
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }
      
      // Callback endpoint - handle OAuth callback
      if (url.pathname === '/auth/callback') {
        const response = await handleCallback(request, env, logger);
        // Clone headers and add CORS headers (avoid immutable headers error)
        const newHeaders = new Headers(response.headers);
        Object.entries(corsHeaders).forEach(([key, value]) => {
          newHeaders.set(key, value);
        });
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }
      
      // Usage stats endpoint - get current usage for a developer
      if (url.pathname === '/usage/stats') {
        const developerId = url.searchParams.get('developer_id');
        
        if (!developerId) {
          return createErrorResponse('missing_params', 'Required: developer_id', 400);
        }
        
        const { getUsageStats, getDeveloperPlan } = await import('./utils/usage');
        const { PLAN_CONFIG } = await import('./plans');
        
        const [usage, plan] = await Promise.all([
          getUsageStats(env, developerId),
          getDeveloperPlan(env, developerId),
        ]);
        
        const limits = PLAN_CONFIG[plan];
        
        return new Response(
          JSON.stringify({
            developer_id: developerId,
            plan,
            limits,
            usage,
            remaining: {
              daily: limits.daily - usage.daily,
              monthly: limits.monthly - usage.monthly,
            },
            timestamp: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          }
        );
      }
      
      // ========== 管理员 API ==========
      
      // GET /admin/projects - 获取所有项目
      if (url.pathname === '/admin/projects' && request.method === 'GET') {
        return await handleGetProjects(request, env, logger);
      }
      
      // POST /admin/projects - 创建新项目（管理员配置 Supabase）
      if (url.pathname === '/admin/projects' && request.method === 'POST') {
        return await handleCreateProject(request, env, logger);
      }
      
      // PUT /admin/projects/:id - 更新项目
      if (url.pathname.startsWith('/admin/projects/') && request.method === 'PUT') {
        const projectId = url.pathname.split('/')[3];
        return await handleUpdateProject(request, env, logger, projectId);
      }
      
      // DELETE /admin/projects/:id - 删除项目
      if (url.pathname.startsWith('/admin/projects/') && request.method === 'DELETE') {
        const projectId = url.pathname.split('/')[3];
        return await handleDeleteProject(request, env, logger, projectId);
      }
      
      // GET /admin/projects/:id/providers - 获取项目的所有 OAuth Provider
      if (url.pathname.match(/^\/admin\/projects\/[^\/]+\/providers$/) && request.method === 'GET') {
        const projectId = url.pathname.split('/')[3];
        return await handleGetProviders(request, env, logger, projectId);
      }
      
      // POST /admin/projects/:id/providers - 添加 OAuth Provider
      if (url.pathname.match(/^\/admin\/projects\/[^\/]+\/providers$/) && request.method === 'POST') {
        const projectId = url.pathname.split('/')[3];
        return await handleAddProvider(request, env, logger, projectId);
      }
      
      // 404 - Not found
      logger.warn(`404 Not Found: ${url.pathname}`);
      return createErrorResponse('not_found', `Endpoint not found: ${url.pathname}`, 404);
      
    } catch (error: any) {
      logger.error('Unhandled error:', error);
      return createErrorResponse(
        'internal_error',
        error.message || 'Internal server error',
        500
      );
    }
  },
};
