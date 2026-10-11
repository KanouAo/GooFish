//  统一请求入口：统一走 axios 到 Python 后端（Server/api_server.py）；前端 Mock 逻辑已停用（见下方注释块）

import axios, { type AxiosRequestConfig, type Method } from 'axios'
import { message } from 'antd'
import type { 统一响应类型 } from '@/types/biz'
import { 后端基址 } from '@/utils/后端地址'

import { 分发Mock } from '@/mock'
import { 注册全部Mock路由 } from '@/mock/handlers'
/** 是否启用本地 Mock，由 .env 中 VITE_USE_MOCK 控制 */
const 启用Mock = import.meta.env.VITE_USE_MOCK === 'true'
// Mock 模式下：模块加载完成后显式注册全部路由（此时依赖均已初始化）
if (启用Mock) {
  注册全部Mock路由()
}

const http实例 = axios.create({
  timeout: 15000,
})

// 请求拦截器：baseURL 每次请求实时读取系统设置里保存的后端 IP/端口（未配置则走 /api proxy）
http实例.interceptors.request.use((配置) => {
  配置.baseURL = 后端基址()
  const 口令 = localStorage.getItem('访问口令')
  if (口令 && 配置.headers) {
    配置.headers.Authorization = `Bearer ${口令}`
  }
  return 配置
})

export interface 请求选项类型 {
  method?: Method
  /** URL query 参数 */
  参数?: Record<string, unknown>
  /** 请求体 */
  data?: unknown
}

/**
 * 统一请求函数
 * @param url 接口路径，如 /tasks/:id
 */
export async function 请求<T>(url: string, 选项: 请求选项类型 = {}): Promise<T> {
  // —— Mock 分发分支已停用（如需恢复把 .env 中 VITE_USE_MOCK 设为 true）——
  if (启用Mock) {
    return 分发Mock<T>({
      url,
      method: 选项.method ?? 'GET',
      query: 选项.参数 ?? {},
      body: 选项.data,
    })
  }

  const axios配置: AxiosRequestConfig = {
    url,
    method: 选项.method ?? 'GET',
    params: 选项.参数,
    data: 选项.data,
  }

  try {
    const 响应 = await http实例.request<统一响应类型<T>>(axios配置)
    const 响应体 = 响应.data
    // 业务约定：code 为 0 表示成功，否则统一提示错误信息
    if (响应体.code !== 0) {
      message.error(响应体.message || '请求失败')
      throw new Error(响应体.message)
    }
    return 响应体.data
  } catch (错误) {
    // 仅对网络层错误做统一提示；上面业务错误已提示过，不重复弹
    const axios错误 = 错误 as { isAxiosError?: boolean; response?: { status?: number } }
    if (axios错误.isAxiosError) {
      const 状态码 = axios错误.response?.status
      message.error(状态码 ? `服务异常（${状态码}）` : '网络连接失败，请检查后端服务')
    }
    throw 错误
  }
}
