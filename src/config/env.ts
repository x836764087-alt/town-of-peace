/**
 * 环境配置
 *
 * 从环境变量读取 LLM (Agnes AI) 配置。
 * 使用方（index.ts 等）负责从 .env 加载。
 */

export interface LLMConfig {
  /** API 基础地址 */
  baseUrl: string;
  /** 可用 API Key 列表（自动过滤空值） */
  apiKeys: string[];
  /** 使用的模型名称 */
  model: string;
  /** 每分钟请求数限制 (RPM) */
  rpm: number;
}

export const ENV = {
  llm: {
    baseUrl: process.env.LLM_API_BASE ?? 'https://api.agnesai.com/v1',
    apiKeys: [
      process.env.LLM_API_KEY_1,
      process.env.LLM_API_KEY_2,
      process.env.LLM_API_KEY_3,
    ].filter((k): k is string => !!k),
    model: process.env.LLM_MODEL ?? 'agnes-2.0-flash',
    rpm: parseInt(process.env.LLM_RPM ?? '60', 10),
  } satisfies LLMConfig,
};
