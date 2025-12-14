# 🎯 UniPass v2.0 - 套餐限制功能升级指南

## ✨ 新增功能

### 1. 基于套餐的请求限制
- ✅ 4 个套餐等级：free / pro / business / enterprise
- ✅ 每日和每月请求限制
- ✅ 应用数量限制
- ✅ 自动限流和错误提示
- ✅ 使用量统计 API

### 2. 套餐配置

| 套餐 | 每日限制 | 每月限制 | 应用数量 |
|------|---------|----------|---------|
| Free | 200 | 6,000 | 1 |
| Pro | 5,000 | 150,000 | 10 |
| Business | 50,000 | 1,500,000 | 无限制 |
| Enterprise | 100,000 | 3,000,000 | 无限制 |

## 🚀 升级步骤

### 步骤 1: 备份数据库（可选）

```bash
# 在 Supabase Dashboard 执行备份
```

### 步骤 2: 更新数据库 Schema

在 Supabase SQL Editor 中运行以下 SQL：

```sql
-- 创建 developers 表
CREATE TABLE IF NOT EXISTS developers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'business', 'enterprise')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_developers_email ON developers(email);
CREATE INDEX IF NOT EXISTS idx_developers_plan ON developers(plan);

-- 更新触发器
CREATE TRIGGER update_developers_updated_at
  BEFORE UPDATE ON developers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS 策略
ALTER TABLE developers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to developers"
  ON developers FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own developer record"
  ON developers FOR SELECT
  USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own developer record"
  ON developers FOR UPDATE
  USING (auth.uid()::text = id::text);
```

### 步骤 3: 迁移现有数据

为每个现有的 owner_id 创建 developer 记录：

```sql
-- 方法 1: 自动迁移所有现有 owner
INSERT INTO developers (id, email, plan)
SELECT DISTINCT 
  owner_id,
  owner_id || '@migrated.user',  -- 临时邮箱
  'free'  -- 默认套餐
FROM projects
WHERE owner_id NOT IN (SELECT id FROM developers);

-- 方法 2: 手动添加开发者
INSERT INTO developers (id, email, plan)
VALUES 
  ('your-developer-uuid', 'dev@example.com', 'free');
```

### 步骤 4: 更新 projects 表外键（可选）

如果需要强制外键约束：

```sql
-- 添加外键约束
ALTER TABLE projects 
  ADD CONSTRAINT projects_owner_id_fkey 
  FOREIGN KEY (owner_id) 
  REFERENCES developers(id) 
  ON DELETE CASCADE;
```

### 步骤 5: 部署更新的 Worker

```bash
# 在你的项目目录
cd /path/to/your/unipass

# 解压新代码（覆盖 src 目录）
tar -xzf unipass-v2.tar.gz

# 部署
wrangler deploy
```

### 步骤 6: 验证部署

```bash
# 健康检查
curl https://your-worker.workers.dev/health

# 查询使用量统计
curl "https://your-worker.workers.dev/usage/stats?developer_id=your-developer-uuid"
```

## 📊 新增 API 端点

### GET /usage/stats

查询开发者的使用量统计。

**请求参数：**
- `developer_id` (必需) - 开发者 UUID

**响应示例：**
```json
{
  "developer_id": "abc-123",
  "plan": "free",
  "limits": {
    "daily": 200,
    "monthly": 6000,
    "apps": 1
  },
  "usage": {
    "daily": 45,
    "monthly": 1230
  },
  "remaining": {
    "daily": 155,
    "monthly": 4770
  },
  "timestamp": "2024-12-07T12:00:00.000Z"
}
```

## 🔒 限制行为

### 登录时检查（/auth/login）

在重定向到 OAuth 提供商**之前**检查限制：

```bash
# 如果超限，返回 429 错误
{
  "error": "LIMIT_EXCEEDED",
  "error_description": "Daily limit exceeded",
  "current_plan": "free",
  "required_plan": "pro",
  "current_usage": {
    "daily": 200,
    "monthly": 1500
  }
}
```

### 回调时计数（/auth/callback）

只有在 OAuth **成功完成**后才增加计数器。

## 📝 前端集成示例

### 处理限制错误

```javascript
async function loginWithProvider(provider) {
  const response = await fetch(
    `https://your-worker.workers.dev/auth/login?app_id=my-app&provider=${provider}&redirect=/dashboard`
  );
  
  if (response.status === 429) {
    const data = await response.json();
    
    // 显示升级提示
    alert(`
      已达到使用限制！
      当前套餐: ${data.current_plan}
      建议升级到: ${data.required_plan}
    `);
    
    // 重定向到升级页面
    window.location.href = '/upgrade';
    return;
  }
  
  // 正常登录流程
  if (response.redirected) {
    window.location.href = response.url;
  }
}
```

### 显示使用量统计

```javascript
async function fetchUsageStats(developerId) {
  const response = await fetch(
    `https://your-worker.workers.dev/usage/stats?developer_id=${developerId}`
  );
  
  const stats = await response.json();
  
  console.log('Today:', stats.usage.daily, '/', stats.limits.daily);
  console.log('This month:', stats.usage.monthly, '/', stats.limits.monthly);
  
  // 显示在 UI 上
  document.getElementById('usage-bar').style.width = 
    `${(stats.usage.daily / stats.limits.daily) * 100}%`;
}
```

## 🔧 修改套餐限制

编辑 `src/plans.ts`:

```typescript
export const PLAN_CONFIG: Record<PlanType, PlanLimits> = {
  free: {
    daily: 200,      // 修改这里
    monthly: 6000,   // 修改这里
    apps: 1,         // 修改这里
  },
  // ...
};
```

重新部署：
```bash
wrangler deploy
```

## 🎁 新增文件列表

- ✅ `src/plans.ts` - 套餐配置
- ✅ `src/utils/usage.ts` - 使用量追踪
- ✅ 更新 `src/types.ts` - 新增类型
- ✅ 更新 `src/router.ts` - 限制检查
- ✅ 更新 `src/index.ts` - 统计端点
- ✅ 更新 `schema.sql` - developers 表

## ⚠️ 重要提示

1. **向后兼容**：现有配置（KV、Secrets）无需修改
2. **数据迁移**：必须先创建 developers 记录
3. **测试建议**：先在 preview 环境测试
4. **回滚方案**：保留旧版本代码以便回滚

## 🧪 测试流程

### 1. 测试限制检查

```bash
# 模拟达到限制
# 在 KV 中手动设置使用量
wrangler kv:key put --namespace-id=your-kv-id \
  "usage:developer-id:day:20241207" "200"

# 尝试登录（应该失败）
curl "https://your-worker.workers.dev/auth/login?app_id=test&provider=wechat&redirect=/dashboard"
```

### 2. 测试统计端点

```bash
curl "https://your-worker.workers.dev/usage/stats?developer_id=your-developer-uuid"
```

### 3. 测试完整流程

1. 正常登录 → 应该成功
2. 查看统计 → usage.daily 应该增加 1
3. 重复 200 次 → 第 201 次应该返回 429

## 📞 需要帮助？

遇到问题？检查：
1. developers 表是否创建成功
2. 是否已迁移现有 owner_id
3. wrangler deploy 是否成功
4. KV 缓存是否工作正常

---

**升级完成！** 🎉 你的 OAuth 网关现在支持完整的套餐限制功能！
