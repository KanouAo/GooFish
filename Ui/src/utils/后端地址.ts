//  后台连接地址配置：在系统设置页填写后端 IP 与端口，持久化到浏览器 localStorage
//  - 已保存配置：前端直连 http://IP:端口（跨源，后端已开启 CORS），修改立即生效，不依赖 vite proxy
//  - 未保存配置：回退 .env 的 VITE_API_BASE_URL（开发默认 /api，经 vite proxy 转发到后端）

/** 后台连接地址配置 */
export interface 后端地址配置类型 {
  /** 后端 IP，如 127.0.0.1 */
  IP: string
  /** 后端端口，如 8000 */
  端口: number
}

const 存储键 = '后端连接地址'

/** 默认值（与 option.yaml 的 server_host/server_port 对齐，仅用于表单占位） */
export const 默认后端IP = '127.0.0.1'
export const 默认后端端口 = 51266

/** 读取已保存的后端地址配置；未保存或内容损坏时返回 null（此时走 vite proxy） */
export function 读取后端地址配置(): 后端地址配置类型 | null {
  const 原文 = localStorage.getItem(存储键)
  if (!原文) {
    return null
  }
  try {
    const 数据 = JSON.parse(原文) as Partial<后端地址配置类型>
    if (!数据.IP || !数据.端口) {
      return null
    }
    return { IP: String(数据.IP), 端口: Number(数据.端口) }
  } catch {
    return null
  }
}

/** 保存后端地址配置并通知订阅者（axios 下次请求即用；SSE 立即重连） */
export function 保存后端地址配置(配置: 后端地址配置类型): void {
  localStorage.setItem(存储键, JSON.stringify(配置))
  通知变更()
}

/** 清除后端地址配置，回退到 vite proxy 模式 */
export function 清除后端地址配置(): void {
  localStorage.removeItem(存储键)
  通知变更()
}

/** 计算当前请求基址：已配置则 http://IP:端口 直连；未配置走 env（/api proxy） */
export function 后端基址(): string {
  const 配置 = 读取后端地址配置()
  if (配置) {
    return `http://${配置.IP}:${配置.端口}`
  }
  return import.meta.env.VITE_API_BASE_URL
}

// ---------- 配置变更订阅（供 SSE hook 在地址变化时立即重连） ----------

type 变更监听器 = () => void
const 监听器集合 = new Set<变更监听器>()

/** 订阅后端地址变更，返回取消订阅函数 */
export function 订阅后端地址变更(回调: 变更监听器): () => void {
  监听器集合.add(回调)
  return () => {
    监听器集合.delete(回调)
  }
}

function 通知变更(): void {
  监听器集合.forEach((fn) => fn())
}
