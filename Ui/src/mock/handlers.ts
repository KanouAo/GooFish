//  Mock 路由处理器集合：模拟后端各业务接口的真实行为（过滤、分页、增删改）
// 所有注册逻辑包在 注册全部Mock路由() 内，由请求层在模块就绪后显式调用，避免循环依赖初始化问题

import { 注册路由, type Mock上下文类型 } from './index'
import { 数据库, 偏移时间, 格式化时间 } from './db'
import type {
  分页结果类型,
  商品类型,
  推送配置类型,
  搜索任务表单类型,
  搜索任务类型,
  系统配置类型,
  调度状态类型,
  看板统计类型,
} from '@/types/biz'

// ---------- 查询参数取值小工具 ----------
const 取文本 = (值: unknown): string => (值 === undefined || 值 === null ? '' : String(值))
const 取数字 = (值: unknown): number | null => {
  if (值 === undefined || 值 === null || 值 === '') return null
  const 数字 = Number(值)
  return Number.isFinite(数字) ? 数字 : null
}
const 取布尔 = (值: unknown): boolean => 值 === true || 值 === 'true'

/** 注册全部 Mock 路由（仅在 Mock 模式下调用一次） */
export function 注册全部Mock路由(): void {
  // ===================== 数据看板 =====================

  注册路由('GET', '/dashboard/stats', () => {
    const 今日前缀 = 格式化时间(new Date()).slice(0, 10)
    const 价格区间 = [
      { 区间: '0-100', 下限: 0, 上限: 100 },
      { 区间: '100-300', 下限: 100, 上限: 300 },
      { 区间: '300-500', 下限: 300, 上限: 500 },
      { 区间: '500-1000', 下限: 500, 上限: 1000 },
      { 区间: '1000-2000', 下限: 1000, 上限: 2000 },
      { 区间: '2000以上', 下限: 2000, 上限: Number.POSITIVE_INFINITY },
    ]

    const 统计: 看板统计类型 = {
      任务总数: 数据库.任务列表.length,
      启用任务数: 数据库.任务列表.filter((t) => t.启用).length,
      商品总数: 数据库.商品列表.length,
      今日新增商品: 数据库.商品列表.filter((g) => g.最近发现.slice(0, 10) === 今日前缀).length,
      今日推送数: 数据库.推送记录.filter((p) => p.时间.slice(0, 10) === 今日前缀).length,
      降价商品数: 数据库.商品列表.filter((g) => g.降价).length,
      关键词分布: Array.from(
        数据库.商品列表.reduce((映射, g) => {
          映射.set(g.所属关键词, (映射.get(g.所属关键词) ?? 0) + 1)
          return 映射
        }, new Map<string, number>()),
      ).map(([名称, 数量]) => ({ 名称, 数量 })),
      价格区间分布: 价格区间.map(({ 区间, 下限, 上限 }) => ({
        区间,
        数量: 数据库.商品列表.filter((g) => g.价格 >= 下限 && g.价格 < 上限).length,
      })),
    }
    return 统计
  })

  // ===================== 搜索任务管理 =====================

  注册路由('GET', '/tasks', (ctx: Mock上下文类型) => {
    const 关键词 = 取文本(ctx.query.关键词).trim()
    const 有状态过滤 = ctx.query.启用状态 !== undefined && ctx.query.启用状态 !== ''
    return 数据库.任务列表.filter((t) => {
      if (关键词 && !t.关键词.includes(关键词) && !t.备注.includes(关键词)) return false
      if (有状态过滤 && t.启用 !== 取布尔(ctx.query.启用状态)) return false
      return true
    })
  })

  注册路由('POST', '/tasks', (ctx: Mock上下文类型) => {
    const 表单 = ctx.body as 搜索任务表单类型
    const 最大编号 = 数据库.任务列表.reduce((最大, t) => Math.max(最大, Number(t.id)), 0)
    const 新任务: 搜索任务类型 = {
      ...表单,
      id: String(最大编号 + 1),
      创建时间: 格式化时间(new Date()),
    }
    数据库.任务列表.push(新任务)
    return 新任务
  })

  注册路由('PUT', '/tasks/:id', (ctx: Mock上下文类型) => {
    const 表单 = ctx.body as 搜索任务表单类型
    const 索引 = 数据库.任务列表.findIndex((t) => t.id === ctx.params.id)
    if (索引 === -1) throw new Error('任务不存在')
    数据库.任务列表[索引] = { ...数据库.任务列表[索引], ...表单, id: ctx.params.id }
    return 数据库.任务列表[索引]
  })

  注册路由('DELETE', '/tasks/:id', (ctx: Mock上下文类型) => {
    const 索引 = 数据库.任务列表.findIndex((t) => t.id === ctx.params.id)
    if (索引 === -1) throw new Error('任务不存在')
    数据库.任务列表.splice(索引, 1)
    return { id: ctx.params.id }
  })

  注册路由('PATCH', '/tasks/:id/status', (ctx: Mock上下文类型) => {
    const 任务 = 数据库.任务列表.find((t) => t.id === ctx.params.id)
    if (!任务) throw new Error('任务不存在')
    任务.启用 = 取布尔((ctx.body as { 启用?: unknown }).启用)
    return { id: 任务.id, 启用: 任务.启用 }
  })

  /** 手动试跑一次：模拟请求咸鱼接口并返回命中概况 */
  注册路由('POST', '/tasks/:id/run', (ctx: Mock上下文类型) => {
    const 任务 = 数据库.任务列表.find((t) => t.id === ctx.params.id)
    if (!任务) throw new Error('任务不存在')
    return {
      任务ID: 任务.id,
      结果数: 18 + (Number(任务.id) % 12),
      新商品数: Number(任务.id) % 5,
      信息: `关键词「${任务.关键词}」试跑完成`,
    }
  })

  // ===================== 商品数据管理 =====================

  注册路由('GET', '/goods', (ctx: Mock上下文类型) => {
    const 页码 = 取数字(ctx.query.页码) ?? 1
    const 每页条数 = 取数字(ctx.query.每页条数) ?? 10
    const 关键词 = 取文本(ctx.query.关键词).trim()
    const 地区 = 取文本(ctx.query.地区)
    const 最低价格 = 取数字(ctx.query.最低价格)
    const 最高价格 = 取数字(ctx.query.最高价格)

    const 过滤后 = 数据库.商品列表.filter((g) => {
      if (关键词 && !g.标题.includes(关键词)) return false
      if (地区 && g.地区 !== 地区) return false
      if (最低价格 !== null && g.价格 < 最低价格) return false
      if (最高价格 !== null && g.价格 > 最高价格) return false
      if (取布尔(ctx.query.只看降价) && !g.降价) return false
      if (取布尔(ctx.query.只看收藏) && !g.收藏) return false
      return true
    })

    const 起始 = (页码 - 1) * 每页条数
    const 结果: 分页结果类型<商品类型> = {
      列表: 过滤后.slice(起始, 起始 + 每页条数),
      总数: 过滤后.length,
      页码,
      每页条数,
    }
    return 结果
  })

  注册路由('DELETE', '/goods/:id', (ctx: Mock上下文类型) => {
    const 索引 = 数据库.商品列表.findIndex((g) => g.id === ctx.params.id)
    if (索引 === -1) throw new Error('商品不存在')
    数据库.商品列表.splice(索引, 1)
    return { id: ctx.params.id }
  })

  注册路由('PATCH', '/goods/:id/collect', (ctx: Mock上下文类型) => {
    const 商品 = 数据库.商品列表.find((g) => g.id === ctx.params.id)
    if (!商品) throw new Error('商品不存在')
    商品.收藏 = 取布尔((ctx.body as { 收藏?: unknown }).收藏)
    return { id: 商品.id, 收藏: 商品.收藏 }
  })

  // ===================== 爬取任务调度 =====================

  const 构建调度状态 = (): 调度状态类型 => ({
    运行中: 数据库.调度运行中,
    任务总数: 数据库.任务列表.length,
    启用任务数: 数据库.任务列表.filter((t) => t.启用).length,
    间隔秒数: 数据库.间隔秒数,
    最大重试次数: 数据库.最大重试次数,
    上次执行时间: 数据库.上次执行时间,
    下次执行时间: 数据库.调度运行中 ? 偏移时间(数据库.间隔秒数 / 3600) : null,
  })

  注册路由('GET', '/scheduler/status', () => 构建调度状态())

  注册路由('POST', '/scheduler/start', () => {
    数据库.调度运行中 = true
    return 构建调度状态()
  })

  注册路由('POST', '/scheduler/stop', () => {
    数据库.调度运行中 = false
    return 构建调度状态()
  })

  注册路由('PUT', '/scheduler/config', (ctx: Mock上下文类型) => {
    const 体 = ctx.body as { 间隔秒数?: number; 最大重试次数?: number }
    if (体.间隔秒数 !== undefined) 数据库.间隔秒数 = 体.间隔秒数
    if (体.最大重试次数 !== undefined) 数据库.最大重试次数 = 体.最大重试次数
    return 构建调度状态()
  })

  注册路由('GET', '/scheduler/records', () => 数据库.执行记录)

  /** 立即执行指定任务：生成一条新的执行记录并置于最前 */
  注册路由('POST', '/scheduler/run/:taskId', (ctx: Mock上下文类型) => {
    const 任务 = 数据库.任务列表.find((t) => t.id === ctx.params.taskId)
    if (!任务) throw new Error('任务不存在')
    const 新记录 = {
      id: `${Date.now()}`,
      任务ID: 任务.id,
      任务名称: `${任务.关键词}蹲守`,
      开始时间: 格式化时间(new Date()),
      耗时秒: 4 + (Number(任务.id) % 6),
      状态: '成功' as const,
      结果数: 20 + (Number(任务.id) % 10),
      新商品数: Number(任务.id) % 4,
      推送数: Number(任务.id) % 3,
      信息: '手动触发，获得成功',
    }
    数据库.执行记录.unshift(新记录)
    数据库.上次执行时间 = 新记录.开始时间
    return 新记录
  })

  // ===================== 推送设置与记录 =====================

  注册路由('GET', '/push/config', () => 数据库.推送配置)

  注册路由('PUT', '/push/config', (ctx: Mock上下文类型) => {
    数据库.推送配置 = { ...数据库.推送配置, ...(ctx.body as 推送配置类型) }
    return 数据库.推送配置
  })

  注册路由('GET', '/push/records', () => 数据库.推送记录)

  // ===================== 系统设置 =====================

  注册路由('GET', '/settings', () => 数据库.系统配置)

  注册路由('PUT', '/settings', (ctx: Mock上下文类型) => {
    数据库.系统配置 = { ...数据库.系统配置, ...(ctx.body as 系统配置类型) }
    // 访问口令同步到本地，供请求拦截器预留使用
    localStorage.setItem('访问口令', 数据库.系统配置.访问口令)
    return 数据库.系统配置
  })

  /** 模拟手动刷新咸鱼令牌 */
  注册路由('POST', '/settings/refresh-token', () => {
    数据库.系统配置.令牌状态 = '正常'
    return 数据库.系统配置
  })
}
