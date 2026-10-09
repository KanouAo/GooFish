//  推送设置与记录接口（对应 wechat_option.yaml / push 段）
import { 请求 } from '@/utils/request'
import type { 推送记录类型, 推送配置类型 } from '@/types/biz'

/** 获取推送配置 */
export const 获取推送配置 = () => 请求<推送配置类型>('/push/config')

/** 保存推送配置 */
export const 更新推送配置 = (配置: 推送配置类型) =>
  请求<推送配置类型>('/push/config', { method: 'PUT', data: 配置 })

/** 获取推送历史记录 */
export const 获取推送记录 = () => 请求<推送记录类型[]>('/push/records')
