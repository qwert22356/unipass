import { OAuthProvider } from './base';
import WeChatProvider from './wechat';
import QQProvider from './qq';
import DouyinProvider from './douyin';
import DingTalkProvider from './dingtalk';
import WeiboProvider from './weibo';
import AlipayProvider from './alipay';  // 🆕 新增

/**
 * Provider Registry
 * 
 * 添加新 Provider 的步骤：
 * 1. 创建新的 Provider 类文件（继承 BaseProvider）
 * 2. 在此文件导入
 * 3. 在 providers 对象中注册
 * 4. 部署后即可使用
 */
export const providers: Record<string, OAuthProvider> = {
  wechat: new WeChatProvider(),
  qq: new QQProvider(),
  douyin: new DouyinProvider(),
  dingtalk: new DingTalkProvider(),
  weibo: new WeiboProvider(),
  alipay: new AlipayProvider(),  // 🆕 新增
};

/**
 * Get provider by name
 */
export function getProvider(name: string): OAuthProvider | null {
  return providers[name.toLowerCase()] || null;
}

/**
 * List all available providers
 */
export function listProviders(): string[] {
  return Object.keys(providers);
}

/**
 * Check if provider exists
 */
export function hasProvider(name: string): boolean {
  return name.toLowerCase() in providers;
}
