import { Env } from '../types';
import { Logger } from '../utils/logger';
import { createErrorResponse } from '../utils/error';
import { SupabaseClient } from '../utils/supabase';
import { invalidateAppCache } from '../utils/cache';
import { generateNonce } from '../utils/crypto';
import { CORS_HEADERS } from '../config';
import { hasProvider } from '../providers/registry';

/**
 * Admin API for managing developer projects
 * 管理员用于配置他们自己的 Supabase 信息和 OAuth 凭证
 */

/**
 * POST /admin/projects - 创建新项目（管理员配置自己的 Supabase）
 * 
 * 请求体：
 * {
 *   "name": "My App",
 *   "frontend_base_url": "https://myapp.com",
 *   "supabase_url": "https://xxx.supabase.co",
 *   "supabase_service_role_key": "eyJhbGc..."
 * }
 */
export async function handleCreateProject(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  try {
    // 1. 验证管理员身份（从 Authorization header 获取）
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createErrorResponse('UNAUTHORIZED', 'Missing or invalid authorization header', 401);
    }

    const developerToken = authHeader.replace('Bearer ', '');
    
    // 验证 token 并获取 developer_id
    const masterSupabase = new SupabaseClient(
      env.MASTER_SUPABASE_URL,
      env.MASTER_SUPABASE_SERVICE_ROLE_KEY
    );
    
    const developer = await verifyDeveloperToken(masterSupabase, developerToken);
    if (!developer) {
      return createErrorResponse('UNAUTHORIZED', 'Invalid token', 401);
    }

    // 2. 解析请求体
    const body = await request.json() as any;
    
    // 3. 验证必需字段
    const requiredFields = ['name', 'frontend_base_url', 'supabase_url', 'supabase_service_role_key'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return createErrorResponse(
          'MISSING_FIELD',
          `Required field: ${field}`,
          400
        );
      }
    }

    // 4. 验证 Supabase 凭证是否有效
    const testSupabase = new SupabaseClient(
      body.supabase_url,
      body.supabase_service_role_key
    );
    
    try {
      // 测试连接
      await testSupabase.fetch('/auth/v1/health');
    } catch (error) {
      return createErrorResponse(
        'INVALID_SUPABASE_CREDENTIALS',
        'Unable to connect to Supabase with provided credentials',
        400
      );
    }

    // 5. 生成唯一的 project_id
    const project_id = generateProjectId();

    // 6. 插入到 master Supabase
    const insertResponse = await masterSupabase.fetch('/rest/v1/projects', {
      method: 'POST',
      headers: {
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        id: project_id,
        owner_id: developer.id,
        name: body.name,
        frontend_base_url: body.frontend_base_url,
        supabase_url: body.supabase_url,
        supabase_service_role_key: body.supabase_service_role_key,
      }),
    });

    if (!insertResponse.ok) {
      const error = await insertResponse.text();
      logger.error('Failed to create project:', error);
      return createErrorResponse(
        'DATABASE_ERROR',
        'Failed to create project',
        500
      );
    }

    const projects = await insertResponse.json() as any;
    const project = projects[0];

    logger.info(`Project created: ${project_id} for developer ${developer.id}`);

    // 7. 返回项目信息
    return new Response(
      JSON.stringify({
        success: true,
        project: {
          id: project.id,
          name: project.name,
          frontend_base_url: project.frontend_base_url,
          supabase_url: project.supabase_url,
          created_at: project.created_at,
        },
        message: 'Project created successfully. Now you can add OAuth providers.',
      }),
      {
        status: 201,
        headers: { 
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        },
      }
    );

  } catch (error: any) {
    logger.error('Create project error:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      error.message || 'Internal server error',
      500
    );
  }
}

/**
 * PUT /admin/projects/:id - 更新项目配置
 * 
 * 请求体：
 * {
 *   "name"?: "New Name",
 *   "frontend_base_url"?: "https://newurl.com",
 *   "supabase_url"?: "https://xxx.supabase.co",
 *   "supabase_service_role_key"?: "eyJhbGc..."
 * }
 */
export async function handleUpdateProject(
  request: Request,
  env: Env,
  logger: Logger,
  projectId: string
): Promise<Response> {
  try {
    // 1. 验证管理员身份
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createErrorResponse('UNAUTHORIZED', 'Missing authorization header', 401);
    }

    const developerToken = authHeader.replace('Bearer ', '');
    
    const masterSupabase = new SupabaseClient(
      env.MASTER_SUPABASE_URL,
      env.MASTER_SUPABASE_SERVICE_ROLE_KEY
    );
    
    const developer = await verifyDeveloperToken(masterSupabase, developerToken);
    if (!developer) {
      return createErrorResponse('UNAUTHORIZED', 'Invalid token', 401);
    }

    // 2. 验证项目所有权
    const projectResponse = await masterSupabase.fetch(
      `/rest/v1/projects?id=eq.${projectId}&owner_id=eq.${developer.id}`
    );
    
    const projects = await projectResponse.json() as any;
    if (!projects || projects.length === 0) {
      return createErrorResponse(
        'NOT_FOUND',
        'Project not found or access denied',
        404
      );
    }

    // 3. 解析请求体
    const body = await request.json() as any;

    // 4. 构建更新数据
    const updateData: any = {};
    if (body.name) updateData.name = body.name;
    if (body.frontend_base_url) updateData.frontend_base_url = body.frontend_base_url;
    if (body.supabase_url) updateData.supabase_url = body.supabase_url;
    if (body.supabase_service_role_key) {
      // 验证新凭证
      try {
        const testSupabase = new SupabaseClient(
          body.supabase_url || projects[0].supabase_url,
          body.supabase_service_role_key
        );
        await testSupabase.fetch('/auth/v1/health');
      } catch (error) {
        return createErrorResponse(
          'INVALID_SUPABASE_CREDENTIALS',
          'Unable to connect with new Supabase credentials',
          400
        );
      }
      updateData.supabase_service_role_key = body.supabase_service_role_key;
    }

    if (Object.keys(updateData).length === 0) {
      return createErrorResponse(
        'NOTHING_TO_UPDATE',
        'No valid fields to update',
        400
      );
    }

    // 5. 更新数据库
    const updateResponse = await masterSupabase.fetch(
      `/rest/v1/projects?id=eq.${projectId}`,
      {
        method: 'PATCH',
        headers: {
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(updateData),
      }
    );

    if (!updateResponse.ok) {
      const error = await updateResponse.text();
      logger.error('Failed to update project:', error);
      return createErrorResponse('DATABASE_ERROR', 'Failed to update project', 500);
    }

    // 6. 清除缓存
    await invalidateAppCache(env, projectId);

    logger.info(`Project updated: ${projectId}`);

    const updated = await updateResponse.json() as any;

    return new Response(
      JSON.stringify({
        success: true,
        project: updated[0],
        message: 'Project updated successfully',
      }),
      {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        },
      }
    );

  } catch (error: any) {
    logger.error('Update project error:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      error.message || 'Internal server error',
      500
    );
  }
}

/**
 * GET /admin/projects - 获取管理员的所有项目
 */
export async function handleGetProjects(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createErrorResponse('UNAUTHORIZED', 'Missing authorization header', 401);
    }

    const developerToken = authHeader.replace('Bearer ', '');
    
    const masterSupabase = new SupabaseClient(
      env.MASTER_SUPABASE_URL,
      env.MASTER_SUPABASE_SERVICE_ROLE_KEY
    );
    
    const developer = await verifyDeveloperToken(masterSupabase, developerToken);
    if (!developer) {
      return createErrorResponse('UNAUTHORIZED', 'Invalid token', 401);
    }

    // 查询所有项目
    const response = await masterSupabase.fetch(
      `/rest/v1/projects?owner_id=eq.${developer.id}&select=*`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch projects');
    }

    const projects = await response.json() as any;

    // 隐藏敏感信息
    const sanitizedProjects = projects.map((p: any) => ({
      id: p.id,
      name: p.name,
      frontend_base_url: p.frontend_base_url,
      supabase_url: p.supabase_url,
      created_at: p.created_at,
      updated_at: p.updated_at,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        projects: sanitizedProjects,
        total: sanitizedProjects.length,
      }),
      {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        },
      }
    );

  } catch (error: any) {
    logger.error('Get projects error:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      error.message || 'Internal server error',
      500
    );
  }
}

/**
 * DELETE /admin/projects/:id - 删除项目
 */
export async function handleDeleteProject(
  request: Request,
  env: Env,
  logger: Logger,
  projectId: string
): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createErrorResponse('UNAUTHORIZED', 'Missing authorization header', 401);
    }

    const developerToken = authHeader.replace('Bearer ', '');
    
    const masterSupabase = new SupabaseClient(
      env.MASTER_SUPABASE_URL,
      env.MASTER_SUPABASE_SERVICE_ROLE_KEY
    );
    
    const developer = await verifyDeveloperToken(masterSupabase, developerToken);
    if (!developer) {
      return createErrorResponse('UNAUTHORIZED', 'Invalid token', 401);
    }

    // 验证所有权
    const checkResponse = await masterSupabase.fetch(
      `/rest/v1/projects?id=eq.${projectId}&owner_id=eq.${developer.id}`
    );
    
    const projects = await checkResponse.json() as any;
    if (!projects || projects.length === 0) {
      return createErrorResponse(
        'NOT_FOUND',
        'Project not found or access denied',
        404
      );
    }

    // 删除项目（会级联删除 oauth_credentials）
    const deleteResponse = await masterSupabase.fetch(
      `/rest/v1/projects?id=eq.${projectId}`,
      { method: 'DELETE' }
    );

    if (!deleteResponse.ok) {
      throw new Error('Failed to delete project');
    }

    // 清除缓存
    await invalidateAppCache(env, projectId);

    logger.info(`Project deleted: ${projectId}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Project deleted successfully',
      }),
      {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        },
      }
    );

  } catch (error: any) {
    logger.error('Delete project error:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      error.message || 'Internal server error',
      500
    );
  }
}

/**
 * POST /admin/projects/:id/providers - 添加 OAuth Provider 凭证
 * 
 * 支持两种格式：
 * 1. 通用格式（微信/QQ/抖音等）：
 *    { provider, client_id, client_secret, enabled }
 * 
 * 2. 支付宝格式：
 *    { provider: "alipay", client_id, private_key, alipay_public_key, enabled }
 */
export async function handleAddProvider(
  request: Request,
  env: Env,
  logger: Logger,
  projectId: string
): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createErrorResponse('UNAUTHORIZED', 'Missing authorization header', 401);
    }

    const developerToken = authHeader.replace('Bearer ', '');
    
    const masterSupabase = new SupabaseClient(
      env.MASTER_SUPABASE_URL,
      env.MASTER_SUPABASE_SERVICE_ROLE_KEY
    );
    
    const developer = await verifyDeveloperToken(masterSupabase, developerToken);
    if (!developer) {
      return createErrorResponse('UNAUTHORIZED', 'Invalid token', 401);
    }

    // 验证项目所有权
    const projectResponse = await masterSupabase.fetch(
      `/rest/v1/projects?id=eq.${projectId}&owner_id=eq.${developer.id}`
    );
    
    const projects = await projectResponse.json() as any;
    if (!projects || projects.length === 0) {
      return createErrorResponse(
        'NOT_FOUND',
        'Project not found or access denied',
        404
      );
    }

    // 解析请求
    const body = await request.json() as any;
    
    if (!body.provider) {
      return createErrorResponse('MISSING_FIELD', 'Required field: provider', 400);
    }

    // 验证 provider 是否支持
    if (!hasProvider(body.provider)) {
      return createErrorResponse(
        'INVALID_PROVIDER',
        `Provider ${body.provider} is not supported`,
        400
      );
    }

    // 🔑 支付宝特殊处理
    let clientId: string;
    let clientSecret: string;
    let extra: Record<string, any> = {};

    if (body.provider === 'alipay') {
      // 支付宝需要三个字段
      if (!body.client_id || !body.private_key || !body.alipay_public_key) {
        return createErrorResponse(
          'MISSING_FIELD',
          'Alipay requires: client_id, private_key, and alipay_public_key',
          400
        );
      }

      clientId = body.client_id;
      clientSecret = body.private_key;  // 私钥存储在 client_secret 字段
      extra = {
        alipay_public_key: body.alipay_public_key,  // 公钥存储在 extra
      };
    } else {
      // 其他平台的标准处理
      if (!body.client_id || !body.client_secret) {
        return createErrorResponse(
          'MISSING_FIELD',
          'Required fields: client_id and client_secret',
          400
        );
      }

      clientId = body.client_id;
      clientSecret = body.client_secret;
      extra = body.extra || {};
    }

    // 插入凭证
    const insertResponse = await masterSupabase.fetch('/rest/v1/oauth_credentials', {
      method: 'POST',
      headers: {
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        project_id: projectId,
        provider: body.provider,
        client_id: clientId,
        client_secret: clientSecret,
        extra: extra,
        enabled: body.enabled !== false,
      }),
    });

    if (!insertResponse.ok) {
      const error = await insertResponse.text();
      
      // 检查是否是重复
      if (error.includes('unique') || error.includes('duplicate')) {
        return createErrorResponse(
          'DUPLICATE_PROVIDER',
          `Provider ${body.provider} already configured for this project`,
          409
        );
      }
      
      logger.error('Failed to add provider:', error);
      return createErrorResponse('DATABASE_ERROR', 'Failed to add provider', 500);
    }

    // 清除缓存
    await invalidateAppCache(env, projectId);

    const credentials = await insertResponse.json() as any;

    logger.info(`Provider added: ${body.provider} for project ${projectId}`);

    return new Response(
      JSON.stringify({
        success: true,
        credential: credentials[0],
        message: `${body.provider} provider added successfully`,
      }),
      {
        status: 201,
        headers: { 
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        },
      }
    );

  } catch (error: any) {
    logger.error('Add provider error:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      error.message || 'Internal server error',
      500
    );
  }
}

/**
 * PUT /admin/projects/:id/providers/:provider - 更新 OAuth Provider 配置
 */
export async function handleUpdateProvider(
  request: Request,
  env: Env,
  logger: Logger,
  projectId: string,
  provider: string
): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createErrorResponse('UNAUTHORIZED', 'Missing authorization header', 401);
    }

    const developerToken = authHeader.replace('Bearer ', '');
    
    const masterSupabase = new SupabaseClient(
      env.MASTER_SUPABASE_URL,
      env.MASTER_SUPABASE_SERVICE_ROLE_KEY
    );
    
    const developer = await verifyDeveloperToken(masterSupabase, developerToken);
    if (!developer) {
      return createErrorResponse('UNAUTHORIZED', 'Invalid token', 401);
    }

    // 验证项目所有权
    const projectResponse = await masterSupabase.fetch(
      `/rest/v1/projects?id=eq.${projectId}&owner_id=eq.${developer.id}`
    );
    
    const projects = await projectResponse.json() as any;
    if (!projects || projects.length === 0) {
      return createErrorResponse(
        'NOT_FOUND',
        'Project not found or access denied',
        404
      );
    }

    const body = await request.json() as any;

    // 构建更新数据
    let updateData: any = {};

    if (provider === 'alipay') {
      // 支付宝更新
      if (body.client_id) updateData.client_id = body.client_id;
      if (body.private_key) updateData.client_secret = body.private_key;
      
      // 获取现有的 extra 数据
      const existingResponse = await masterSupabase.fetch(
        `/rest/v1/oauth_credentials?project_id=eq.${projectId}&provider=eq.${provider}`
      );
      const existing = await existingResponse.json() as any;
      const currentExtra = existing[0]?.extra || {};
      
      if (body.alipay_public_key) {
        updateData.extra = {
          ...currentExtra,
          alipay_public_key: body.alipay_public_key
        };
      }
    } else {
      // 其他平台更新
      if (body.client_id) updateData.client_id = body.client_id;
      if (body.client_secret) updateData.client_secret = body.client_secret;
      if (body.extra) updateData.extra = body.extra;
    }

    if (body.enabled !== undefined) updateData.enabled = body.enabled;

    if (Object.keys(updateData).length === 0) {
      return createErrorResponse('NOTHING_TO_UPDATE', 'No valid fields to update', 400);
    }

    // 更新
    const updateResponse = await masterSupabase.fetch(
      `/rest/v1/oauth_credentials?project_id=eq.${projectId}&provider=eq.${provider}`,
      {
        method: 'PATCH',
        headers: {
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(updateData),
      }
    );

    if (!updateResponse.ok) {
      const error = await updateResponse.text();
      logger.error('Failed to update provider:', error);
      return createErrorResponse('DATABASE_ERROR', 'Failed to update provider', 500);
    }

    // 清除缓存
    await invalidateAppCache(env, projectId);

    const updated = await updateResponse.json() as any;

    logger.info(`Provider updated: ${provider} for project ${projectId}`);

    return new Response(
      JSON.stringify({
        success: true,
        credential: updated[0],
        message: `${provider} provider updated successfully`,
      }),
      {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        },
      }
    );

  } catch (error: any) {
    logger.error('Update provider error:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      error.message || 'Internal server error',
      500
    );
  }
}

/**
 * GET /admin/projects/:id/providers - 获取项目的所有 OAuth Provider
 */
export async function handleGetProviders(
  request: Request,
  env: Env,
  logger: Logger,
  projectId: string
): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createErrorResponse('UNAUTHORIZED', 'Missing authorization header', 401);
    }

    const developerToken = authHeader.replace('Bearer ', '');
    
    const masterSupabase = new SupabaseClient(
      env.MASTER_SUPABASE_URL,
      env.MASTER_SUPABASE_SERVICE_ROLE_KEY
    );
    
    const developer = await verifyDeveloperToken(masterSupabase, developerToken);
    if (!developer) {
      return createErrorResponse('UNAUTHORIZED', 'Invalid token', 401);
    }

    // 验证项目所有权
    const projectResponse = await masterSupabase.fetch(
      `/rest/v1/projects?id=eq.${projectId}&owner_id=eq.${developer.id}`
    );
    
    const projects = await projectResponse.json() as any;
    if (!projects || projects.length === 0) {
      return createErrorResponse(
        'NOT_FOUND',
        'Project not found or access denied',
        404
      );
    }

    // 查询所有 providers
    const credentialsResponse = await masterSupabase.fetch(
      `/rest/v1/oauth_credentials?project_id=eq.${projectId}`
    );

    if (!credentialsResponse.ok) {
      throw new Error('Failed to fetch providers');
    }

    const credentials = await credentialsResponse.json() as any;

    return new Response(
      JSON.stringify({
        success: true,
        providers: credentials,
        total: credentials.length,
      }),
      {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        },
      }
    );

  } catch (error: any) {
    logger.error('Get providers error:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      error.message || 'Internal server error',
      500
    );
  }
}

/**
 * Helper: 验证开发者 token 并返回开发者信息
 */
async function verifyDeveloperToken(
  supabase: SupabaseClient,
  token: string
): Promise<{ id: string; email: string; plan: string } | null> {
  try {
    // 验证 token（调用 Supabase Auth API）
    const response = await supabase.fetch('/auth/v1/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const user = await response.json() as any;
    
    // 从 developers 表获取完整信息
    const devResponse = await supabase.fetch(
      `/rest/v1/developers?id=eq.${user.id}`
    );
    
    if (!devResponse.ok) {
      return null;
    }
    
    const developers = await devResponse.json() as any;
    if (!developers || developers.length === 0) {
      return null;
    }

    return developers[0];

  } catch (error) {
    return null;
  }
}

/**
 * Helper: 生成唯一的 project ID (标准 UUID)
 */
function generateProjectId(): string {
  return crypto.randomUUID();
}