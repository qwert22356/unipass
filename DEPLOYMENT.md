# 🚀 UniPass 部署指南

完整的部署步骤，从零到生产环境。

## 📋 前置要求

- Node.js 18+
- npm 或 yarn
- Cloudflare 账号
- Supabase 账号
- 各平台的 OAuth 应用凭证（微信/QQ/抖音等）

## 🎯 第一步：准备 Cloudflare Workers

### 1.1 安装 Wrangler CLI

```bash
npm install -g wrangler

# 或使用项目本地安装
npm install
```

### 1.2 登录 Cloudflare

```bash
wrangler login
```

这会打开浏览器，完成 OAuth 授权。

### 1.3 创建 KV Namespace

```bash
# 生产环境
wrangler kv:namespace create "APP_CACHE"
# 输出: 🌀 Creating namespace with title "unipass-oauth-gateway-APP_CACHE"
# ✨ Success!
# Add the following to your configuration file in your kv_namespaces array:
# { binding = "APP_CACHE", id = "xxxxx" }

# 预览环境
wrangler kv:namespace create "APP_CACHE" --preview
# 输出: 🌀 Creating namespace with title "unipass-oauth-gateway-APP_CACHE_preview"
# ✨ Success!
# Add the following to your configuration file in your kv_namespaces array:
# { binding = "APP_CACHE", preview_id = "xxxxx" }
```

### 1.4 更新 wrangler.toml

将上面的 ID 填入配置文件：

```toml
kv_namespaces = [
  { binding = "APP_CACHE", id = "your-prod-id", preview_id = "your-preview-id" }
]
```

## 🗄️ 第二步：配置 Supabase

### 2.1 创建 Master Supabase 项目

1. 访问 https://supabase.com
2. 创建新项目（命名为 `unipass-master`）
3. 记录项目信息：
   - URL: `https://xxxxx.supabase.co`
   - Service Role Key: 在 Settings > API > service_role

### 2.2 执行数据库 Schema

在 Supabase SQL Editor 中执行 `schema.sql`:

```sql
-- 复制 schema.sql 的内容并执行
```

### 2.3 验证表创建

```sql
-- 查看表
SELECT * FROM projects LIMIT 1;
SELECT * FROM oauth_credentials LIMIT 1;
```

## 🔐 第三步：配置 Secrets

```bash
# Master Supabase URL
wrangler secret put MASTER_SUPABASE_URL
# 输入: https://xxxxx.supabase.co

# Master Supabase Service Role Key
wrangler secret put MASTER_SUPABASE_ANON_KEY
# 输入: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 🚢 第四步：部署 Worker

### 4.1 测试本地环境

```bash
npm run dev
```

访问 http://localhost:8787/health 查看状态。

### 4.2 部署到生产环境

```bash
npm run deploy
```

输出示例：
```
Total Upload: 45.67 KiB / gzip: 12.34 KiB
Uploaded unipass-oauth-gateway (1.23 sec)
Published unipass-oauth-gateway (2.34 sec)
  https://unipass-oauth-gateway.your-subdomain.workers.dev
```

### 4.3 验证部署

```bash
curl https://unipass-oauth-gateway.your-subdomain.workers.dev/health
```

预期响应：
```json
{
  "status": "ok",
  "service": "UniPass OAuth Gateway",
  "version": "1.0.0",
  "providers": ["wechat", "qq", "douyin", "dingtalk", "weibo"],
  "timestamp": "2024-12-07T10:00:00.000Z"
}
```

## 🎨 第五步：配置应用

### 5.1 创建测试应用

在 Supabase SQL Editor 中：

```sql
-- 1. 创建应用
INSERT INTO projects (
  id,
  owner_id,
  name,
  frontend_base_url,
  supabase_url,
  supabase_service_role_key
)
VALUES (
  'test-app-001',
  'your-user-uuid',  -- 从 Supabase Auth 获取
  'Test Application',
  'https://yourapp.com',
  'https://your-app.supabase.co',
  'your-app-service-role-key'
);

-- 2. 添加微信 OAuth 凭证
INSERT INTO oauth_credentials (
  project_id,
  provider,
  client_id,
  client_secret,
  enabled
)
VALUES (
  'test-app-001',
  'wechat',
  'wx1234567890',  -- 替换为真实的微信 AppID
  'your-wechat-secret',  -- 替换为真实的微信 Secret
  TRUE
);

-- 3. 添加 QQ OAuth 凭证
INSERT INTO oauth_credentials (
  project_id,
  provider,
  client_id,
  client_secret,
  enabled
)
VALUES (
  'test-app-001',
  'qq',
  '123456789',  -- 替换为真实的 QQ AppID
  'your-qq-secret',  -- 替换为真实的 QQ Secret
  TRUE
);
```

### 5.2 配置 OAuth 回调 URL

在各平台的开发者后台配置回调 URL：

**微信公众平台:**
- 登录: https://mp.weixin.qq.com
- 设置: 开发 > 接口权限 > 网页授权
- 回调域名: `unipass-oauth-gateway.your-subdomain.workers.dev`

**QQ 互联:**
- 登录: https://connect.qq.com
- 设置: 应用管理 > 你的应用 > 回调地址
- 回调地址: `https://unipass-oauth-gateway.your-subdomain.workers.dev/auth/callback`

**抖音开放平台:**
- 登录: https://open.douyin.com
- 设置: 应用管理 > 你的应用 > 回调地址
- 回调地址: `https://unipass-oauth-gateway.your-subdomain.workers.dev/auth/callback`

## 🧪 第六步：测试

### 6.1 测试登录流程

```bash
# 发起微信登录
curl -L "https://unipass-oauth-gateway.your-subdomain.workers.dev/auth/login?app_id=test-app-001&provider=wechat&redirect=/dashboard"

# 这会返回一个重定向到微信 OAuth 页面的响应
```

### 6.2 前端集成测试

创建测试页面 `test.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>UniPass OAuth Test</title>
</head>
<body>
  <h1>OAuth Login Test</h1>
  
  <button onclick="loginWithWeChat()">微信登录</button>
  <button onclick="loginWithQQ()">QQ登录</button>
  <button onclick="loginWithDouyin()">抖音登录</button>
  
  <div id="result"></div>
  
  <script>
    const WORKER_URL = 'https://unipass-oauth-gateway.your-subdomain.workers.dev';
    const APP_ID = 'test-app-001';
    
    function login(provider) {
      const redirect = '/success';
      const url = `${WORKER_URL}/auth/login?app_id=${APP_ID}&provider=${provider}&redirect=${encodeURIComponent(redirect)}`;
      window.location.href = url;
    }
    
    function loginWithWeChat() { login('wechat'); }
    function loginWithQQ() { login('qq'); }
    function loginWithDouyin() { login('douyin'); }
    
    // 检查回调参数
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const error = params.get('error');
    
    if (token) {
      document.getElementById('result').innerHTML = `
        <h2>✅ 登录成功!</h2>
        <p>Token: ${token.substring(0, 20)}...</p>
      `;
    } else if (error) {
      document.getElementById('result').innerHTML = `
        <h2>❌ 登录失败</h2>
        <p>Error: ${error}</p>
        <p>Description: ${params.get('error_description')}</p>
      `;
    }
  </script>
</body>
</html>
```

### 6.3 查看日志

```bash
# 实时查看日志
wrangler tail

# 或在 Cloudflare Dashboard 查看
# Workers & Pages > unipass-oauth-gateway > Logs
```

## 🔍 故障排查

### 问题 1: KV 缓存错误

```bash
# 检查 KV Namespace
wrangler kv:namespace list

# 清空 KV 缓存
wrangler kv:key delete --namespace-id=your-kv-id "project:test-app-001"
```

### 问题 2: Supabase 连接失败

```bash
# 验证 Secret
wrangler secret list

# 重新设置
wrangler secret put MASTER_SUPABASE_URL
wrangler secret put MASTER_SUPABASE_ANON_KEY
```

### 问题 3: OAuth 回调 404

检查各平台的回调 URL 配置是否正确：
```
https://unipass-oauth-gateway.your-subdomain.workers.dev/auth/callback
```

### 问题 4: CORS 错误

Worker 已内置 CORS 支持，如果仍有问题，检查前端请求是否正确。

## 📈 性能监控

### Cloudflare Dashboard

1. Workers & Pages > unipass-oauth-gateway
2. 查看指标：
   - Requests per second
   - Error rate
   - CPU time
   - Duration

### 自定义监控

在代码中添加日志：

```typescript
logger.info('Performance metric', {
  duration: Date.now() - startTime,
  provider: providerName,
  success: true
});
```

## 🔄 更新和维护

### 更新代码

```bash
# 拉取最新代码
git pull

# 重新部署
npm run deploy
```

### 添加新 Provider

1. 创建 Provider 文件
2. 在 registry.ts 注册
3. 部署
4. 在数据库添加凭证

### 回滚版本

```bash
# 查看部署历史
wrangler deployments list

# 回滚到指定版本
wrangler rollback [deployment-id]
```

## 🎓 最佳实践

1. **安全性**
   - 定期更新 Service Role Key
   - 使用环境变量存储敏感信息
   - 启用 Supabase RLS

2. **性能**
   - 合理设置 KV 缓存 TTL
   - 监控 Worker CPU 时间
   - 优化数据库查询

3. **可维护性**
   - 使用语义化版本号
   - 编写详细的 commit 信息
   - 保持代码注释更新

## 📚 相关文档

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Supabase 文档](https://supabase.com/docs)
- [微信开放平台](https://open.weixin.qq.com)
- [QQ 互联](https://connect.qq.com)
- [抖音开放平台](https://open.douyin.com)

---

**部署成功！** 🎉

如有问题，请查看 README.md 或提交 Issue。
