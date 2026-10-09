//  爬取任务调度接口（对应 LoopThread 的控制与记录）
import { 请求 } from '@/utils/request'
import type { 调度状态类型, 执行记录类型 } from '@/types/biz'

/** 获取调度器整体状态 */
export const 获取调度状态 = () => 请求<调度状态类型>('/scheduler/status')

/** 启动调度循环 */
export const 启动调度 = () =>
  请求<调度状态类型>('/scheduler/start', { method: 'POST' })

/** 停止调度循环 */
export const 停止调度 = () =>
  请求<调度状态类型>('/scheduler/stop', { method: 'POST' })

/** 保存全局调度配置（间隔、重试次数） */
export const 更新调度配置 = (配置: { 间隔秒数: number; 最大重试次数: number }) =>
  请求<调度状态类型>('/scheduler/config', { method: 'PUT', data: 配置 })

/** 获取执行记录列表 */
export const 获取执行记录 = () => 请求<执行记录类型[]>('/scheduler/records')

/** 立即执行指定任务 */
export const 立即执行任务 = (任务ID: string) =>
  请求<执行记录类型>(`/scheduler/run/${任务ID}`, { method: 'POST' })
