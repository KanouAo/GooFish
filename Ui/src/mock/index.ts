//  Mock 分发机制：按 METHOD + 路径模式匹配本地处理器
// 注意：本模块不主动 import handlers（Vite 8/Rolldown 会静态提升 import 造成 TDZ），
// 路由注册由 handlers 导出的 注册全部Mock路由() 在请求层显式触发

/** 处理器上下文：路径参数、查询参数、请求体 */
export interface Mock上下文类型 {
  params: Record<string, string>
  query: Record<string, unknown>
  body: unknown
}

type Mock处理函数 = (上下文: Mock上下文类型) => unknown

interface Mock路由类型 {
  method: string
  正则: RegExp
  处理: Mock处理函数
}

const 路由表: Mock路由类型[] = []

/**
 * 注册一条 Mock 路由
 * @param 模式 形如 /goods/:id，:id 为路径参数
 */
export function 注册路由(method: string, 模式: string, 处理: Mock处理函数): void {
  const 正则 = new RegExp('^' + 模式.replace(/:([^/]+)/g, '(?<$1>[^/]+)') + '$')
  路由表.push({ method: method.toUpperCase(), 正则, 处理 })
}

/** 模拟网络延迟，贴近真实请求体验 */
function 模拟延迟(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 180 + Math.random() * 280))
}

export interface Mock请求类型 {
  url: string
  method: string
  query: Record<string, unknown>
  body: unknown
}

/** 分发请求到匹配的 Mock 处理器，未命中则报错（模拟 404） */
export async function 分发Mock<T>(请求信息: Mock请求类型): Promise<T> {
  await 模拟延迟()
  // 去掉 query string，只匹配路径部分
  const 路径 = 请求信息.url.split('?')[0]
  const 路由 = 路由表.find(
    (项) => 项.method === 请求信息.method.toUpperCase() && 项.正则.test(路径),
  )
  if (!路由) {
    throw new Error(`未找到 Mock 路由：${请求信息.method} ${路径}`)
  }
  const 匹配结果 = 路径.match(路由.正则)
  return 路由.处理({
    params: 匹配结果?.groups ?? {},
    query: 请求信息.query,
    body: 请求信息.body,
  }) as T
}
