//  全局应用状态（Zustand）：调度状态需在菜单与调度页之间共享
import { create } from 'zustand'
import { 获取调度状态 } from '@/api/scheduler'
import type { 调度状态类型 } from '@/types/biz'

interface 应用状态类型 {
  /** 调度器状态（侧边菜单与调度页共用） */
  调度状态: 调度状态类型 | null
  /** 拉取最新调度状态 */
  加载调度状态: () => Promise<void>
  /** 直接设置调度状态（操作后本地更新，避免重复请求） */
  设置调度状态: (状态: 调度状态类型) => void
}

export const use应用Store = create<应用状态类型>((set) => ({
  调度状态: null,
  加载调度状态: async () => {
    const 状态 = await 获取调度状态()
    set({ 调度状态: 状态 })
  },
  设置调度状态: (状态) => set({ 调度状态: 状态 }),
}))
