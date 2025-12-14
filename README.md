# 🚀 UniPass - 多租户 OAuth 登录网关

**UniPass** 是一个部署在 Cloudflare Workers 上的多租户 OAuth 认证网关，专为中国社交平台（微信、QQ、抖音、钉钉、微博等）设计。

## ✨ 特性

- 🔐 **多租户架构** - 支持无限个应用，每个应用独立配置
- 🔌 **插件式 Provider** - 轻松添加新的 OAuth 提供商
- 🚀 **边缘部署** - 基于 Cloudflare Workers，全球低延迟
- 💾 **智能缓存** - KV 缓存配置，减少数据库查询
- 🔒 **安全防护** - CSRF 保护、State 验证、Token 过期
- 📊 **完整日志** - 详细的错误追踪和调试信息
- 🎯 **Supabase 集成** - 自动创建用户和生成 Session Token

## 🎯 支持的平台

- ✅ 微信 (WeChat)
- ✅ QQ
- ✅ 抖音 (Douyin)
- ✅ 钉钉 (DingTalk)
- ✅ 微博 (Weibo)
- 🔜 更多平台...

## 📦 项目结构

```
unipass/
├── wrangler.toml              # Cloudflare Workers 配置
├── package.json               # 依赖管理
├── tsconfig.json             # TypeScript 配置
├── schema.sql                # 数据库表结构
├── README.md                 # 本文档
└── src/
    ├── index.ts              # Worker 入口
    ├── types.ts              # TypeScript 类型定义
    ├── config.ts             # 配置常量
    ├── router.ts             # 路由处理
    ├── providers/            # OAuth Provider 实现
    │   ├── base.ts           # Provider 基类
    │   ├── registry.ts       # Provider 注册表
    │   ├── wechat.ts         # 微信
    │   ├── qq.ts             # QQ
    │   ├── douyin.ts         # 抖音
    │   ├── dingtalk.ts       # 钉钉
    │   └── weibo.ts          # 微博
    └── utils/                # 工具函数
        ├── cache.ts          # KV 缓存
        ├── crypto.ts         # 加密和 State 管理
        ├── error.ts          # 错误处理
        ├── logger.ts         # 日志系统
        └── supabase.ts       # Supabase 客户端
```

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 KV Namespace

```bash
# 创建生产环境 KV
wrangler kv:namespace create "APP_CACHE"

# 创建预览环境 KV
wrangler kv:namespace create "APP_CACHE" --preview
```

将返回的 ID 填入 `wrangler.toml`:

```toml
kv_namespaces = [
  { binding = "APP_CACHE", id = "YOUR_KV_ID", preview_id = "YOUR_PREVIEW_KV_ID" }
]
```

### 3. 设置 Supabase

在你的 **Master Supabase** 项目中执行 `schema.sql`:

```bash
# 在 Supabase SQL Editor 中执行
cat schema.sql
```

### 4. 配置环境变量

```bash
# 设置 Master Supabase URL
wrangler secret put MASTER_SUPABASE_URL
# 输入: https://your-master-project.supabase.co

# 设置 Master Supabase Service Role Key
wrangler secret put MASTER_SUPABASE_ANON_KEY
# 输入: your-service-role-key
```

### 5. 部署

```bash
npm run deploy
```

## 📝 使用方法

### 1. 在数据库中创建应用

```sql
-- 插入应用配置
INSERT INTO projects (id, owner_id, name, frontend_base_url, supabase_url, supabase_service_role_key)
VALUES (
  'my-app-id',
  'your-user-uuid',
  'My Application',
  'https://myapp.com',
  'https://my-app.supabase.co',
  'my-app-service-role-key'
);

-- 添加微信 OAuth 凭证
INSERT INTO oauth_credentials (project_id, provider, client_id, client_secret, enabled)
VALUES (
  'my-app-id',
  'wechat',
  'wx1234567890',
  'your-wechat-secret',
  TRUE
);
```

### 2. 前端集成

```html
<!-- 添加登录按钮 -->
<button onclick="loginWithWeChat()">微信登录</button>

<script>
function loginWithWeChat() {
  const appId = 'my-app-id';
  const provider = 'wechat';
  const redirect = '/dashboard'; // 登录后要跳转的页面
  
  const loginUrl = `https://your-worker.workers.dev/auth/login?app_id=${appId}&provider=${provider}&redirect=${encodeURIComponent(redirect)}`;
  
  window.location.href = loginUrl;
}

// 在回调页面获取 token
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');
const error = urlParams.get('error');

if (token) {
  // 成功 - 使用 token 初始化 Supabase
  const { data, error } = await supabase.auth.setSession({
    access_token: token,
    refresh_token: token
  });
  
  // 跳转到应用主页
  window.location.href = '/dashboard';
} else if (error) {
  // 失败 - 显示错误
  alert('登录失败: ' + error);
}
</script>
```

### 3. API 端点

#### Health Check

```bash
GET https://your-worker.workers.dev/health
```

响应:
```json
{
  "status": "ok",
  "service": "UniPass OAuth Gateway",
  "version": "1.0.0",
  "providers": ["wechat", "qq", "douyin", "dingtalk", "weibo"],
  "timestamp": "2024-12-07T10:00:00.000Z"
}
```

#### 发起登录

```bash
GET https://your-worker.workers.dev/auth/login?app_id=my-app&provider=wechat&redirect=/dashboard
```

参数:
- `app_id` - 应用 ID
- `provider` - OAuth 提供商 (wechat/qq/douyin/dingtalk/weibo)
- `redirect` - 登录成功后的跳转路径

#### OAuth 回调

```bash
GET https://your-worker.workers.dev/auth/callback?code=xxx&state=xxx
```

由 OAuth 提供商自动调用，无需手动触发。

## 🔌 添加新的 Provider

### 1. 创建 Provider 文件

创建 `src/providers/xiaohongshu.ts`:

```typescript
import { BaseProvider, TokenResponse } from './base';
import { ProviderConfig, NormalizedUser } from '../types';

export default class XiaohongshuProvider extends BaseProvider {
  name = 'xiaohongshu';
  
  buildAuthURL(config: ProviderConfig, redirect_uri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: config.client_id,
      redirect_uri,
      response_type: 'code',
      state,
    });
    
    return `https://xiaohongshu.com/oauth/authorize?${params.toString()}`;
  }
  
  async exchangeCodeForToken(
    code: string,
    config: ProviderConfig,
    redirect_uri: string
  ): Promise<TokenResponse> {
    // 实现 token 交换逻辑
    const response = await this.fetchWithTimeout('https://api.xiaohongshu.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.client_id,
        client_secret: config.client_secret,
        code,
        grant_type: 'authorization_code',
        redirect_uri,
      }),
    });
    
    const data = await response.json();
    
    return {
      access_token: data.access_token,
      openid: data.openid,
    };
  }
  
  async getUserInfo(tokenResponse: TokenResponse, config: ProviderConfig): Promise<any> {
    // 实现获取用户信息逻辑
    const response = await this.fetchWithTimeout(
      `https://api.xiaohongshu.com/user/info?access_token=${tokenResponse.access_token}`,
      { method: 'GET' }
    );
    
    return await response.json();
  }
  
  normalizeUser(raw: any): NormalizedUser {
    return {
      provider: 'xiaohongshu',
      openid: raw.user_id,
      nickname: raw.nickname || '小红书用户',
      avatar: raw.avatar_url,
      raw,
    };
  }
}
```

### 2. 注册 Provider

在 `src/providers/registry.ts` 中添加:

```typescript
import XiaohongshuProvider from './xiaohongshu';

export const providers: Record<string, OAuthProvider> = {
  // ... 其他 providers
  xiaohongshu: new XiaohongshuProvider(),
};
```

### 3. 重新部署

```bash
npm run deploy
```

### 4. 在数据库中添加凭证

```sql
INSERT INTO oauth_credentials (project_id, provider, client_id, client_secret)
VALUES ('my-app-id', 'xiaohongshu', 'your-client-id', 'your-client-secret');
```

完成！现在你的应用可以使用小红书登录了。

## 🔧 配置

### wrangler.toml

```toml
name = "unipass-oauth-gateway"
main = "src/index.ts"
compatibility_date = "2024-12-01"

kv_namespaces = [
  { binding = "APP_CACHE", id = "your_kv_id", preview_id = "your_preview_kv_id" }
]

[vars]
WORKER_ENV = "production"
LOG_LEVEL = "info"  # debug | info | warn | error
```

### 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `MASTER_SUPABASE_URL` | Master Supabase 项目 URL | `https://xxx.supabase.co` |
| `MASTER_SUPABASE_ANON_KEY` | Master Supabase Service Role Key | `eyJhbGc...` |
| `WORKER_ENV` | 环境标识 | `production` / `staging` |
| `LOG_LEVEL` | 日志级别 | `debug` / `info` / `warn` / `error` |

## 🐛 调试

### 查看日志

```bash
npm run tail
```

### 本地开发

```bash
npm run dev
```

访问: http://localhost:8787

### 常见问题

**1. KV 缓存未生效**

检查 KV Namespace 是否正确绑定:
```bash
wrangler kv:namespace list
```

**2. Supabase 连接失败**

确认环境变量是否正确设置:
```bash
wrangler secret list
```

**3. OAuth 回调失败**

检查回调 URL 是否与 OAuth 平台配置一致。

## 📊 性能优化

- **KV 缓存**: 应用配置缓存 5 分钟
- **请求超时**: 所有外部 API 调用 30 秒超时
- **State 过期**: OAuth State 10 分钟过期
- **边缘计算**: 全球 Cloudflare 边缘节点部署

## 🔒 安全特性

- ✅ CSRF 保护 (State + Nonce)
- ✅ State 时间戳验证
- ✅ 安全的随机数生成
- ✅ Supabase Service Role Key 加密存储
- ✅ 完整的错误处理
- ✅ 请求超时保护

## 📄 License

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**Made with ❤️ by UniPass Team**
