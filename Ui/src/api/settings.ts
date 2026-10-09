//  系统设置接口（对应 option.yaml 全局段）
import { 请求 } from '@/utils/request'
import type { 系统配置类型 } from '@/types/biz'

/** 获取系统配置 */
export const 获取系统配置 = () => 请求<系统配置类型>('/settings')

/** 保存系统配置 */
export const 更新系统配置 = (配置: 系统配置类型) =>
  请求<系统配置类型>('/settings', { method: 'PUT', data: 配置 })

/** 手动刷新咸鱼令牌 */
export const 刷新咸鱼令牌 = () =>
  请求<系统配置类型>('/settings/refresh-token', { method: 'POST' })
