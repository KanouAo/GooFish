//  搜索任务接口（对应后端 option.yaml 的 good 列表增删改查）
import { 请求 } from '@/utils/request'
import type { 任务查询类型, 搜索任务表单类型, 搜索任务类型 } from '@/types/biz'

/** 手动试跑结果 */
export interface 试跑结果类型 {
  任务ID: string
  结果数: number
  新商品数: number
  信息: string
}

/** 查询搜索任务列表 */
export const 获取任务列表 = (查询: 任务查询类型 = {}) =>
  请求<搜索任务类型[]>('/tasks', { 参数: 查询 as unknown as Record<string, unknown> })

/** 新建搜索任务 */
export const 新建任务 = (表单: 搜索任务表单类型) =>
  请求<搜索任务类型>('/tasks', { method: 'POST', data: 表单 })

/** 更新搜索任务 */
export const 更新任务 = (id: string, 表单: 搜索任务表单类型) =>
  请求<搜索任务类型>(`/tasks/${id}`, { method: 'PUT', data: 表单 })

/** 删除搜索任务 */
export const 删除任务 = (id: string) =>
  请求<{ id: string }>(`/tasks/${id}`, { method: 'DELETE' })

/** 启用/停用搜索任务 */
export const 切换任务状态 = (id: string, 启用: boolean) =>
  请求<{ id: string; 启用: boolean }>(`/tasks/${id}/status`, {
    method: 'PATCH',
    data: { 启用 },
  })

/** 手动试跑一次 */
export const 试跑任务 = (id: string) =>
  请求<试跑结果类型>(`/tasks/${id}/run`, { method: 'POST' })
