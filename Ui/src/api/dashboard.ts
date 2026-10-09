//  数据看板接口
import { 请求 } from '@/utils/request'
import type { 看板统计类型 } from '@/types/biz'

/** 获取看板汇总统计（总量、关键词分布、价格区间分布） */
export const 获取看板统计 = () => 请求<看板统计类型>('/dashboard/stats')
