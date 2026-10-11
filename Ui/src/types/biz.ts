//  全局业务类型定义，字段命名与后端 option.yaml / good_record.json 概念对齐

/** 后端统一响应包裹结构（真实接口约定，Mock 层不包裹直接返回 data） */
export interface 统一响应类型<T> {
  code: number
  message: string
  data: T
}

/** 通用分页结果 */
export interface 分页结果类型<T> {
  列表: T[]
  总数: number
  页码: number
  每页条数: number
}

// ===================== 搜索任务 =====================

/** 排序方式：综合 / 新降价 / 新发布 / 价格升降序（对应后端 sortField + sortValue） */
export type 排序方式类型 = '综合' | '新降价' | '新发布' | '价格升序' | '价格降序'

/** 发布天数过滤：空为不限（对应 publishDays） */
export type 发布天数类型 = '' | '1' | '3' | '7' | '14'

/** 搜索任务（对应 option.yaml 中 good 列表的一项） */
export interface 搜索任务类型 {
  id: string
  /** 搜索关键词 */
  关键词: string
  /** 标题必含词：标题须同时包含全部 */
  必含词: string[]
  /** 标题屏蔽词：标题含任一词即排除 */
  屏蔽词: string[]
  排序方式: 排序方式类型
  价格最低: number | null
  价格最高: number | null
  发布天数: 发布天数类型
  /** 快捷过滤英文标识，如 filterFreePostage（对应 quickFilter） */
  快捷过滤: string[]
  /** 卖家地区，如 江浙沪 */
  卖家地区: string
  页数: number
  每页条数: number
  启用: boolean
  备注: string
  创建时间: string
}

/** 搜索任务表单值（新建/编辑） */
export type 搜索任务表单类型 = Omit<搜索任务类型, 'id' | '创建时间'>

/** 搜索任务列表查询条件 */
export interface 任务查询类型 {
  关键词?: string
  启用状态?: boolean
}

// ===================== 商品数据 =====================

/** 已收录商品（good_record.json 扩展版；当前后端仅存 id 与价格，其余字段待后端落库） */
export interface 商品类型 {
  id: string
  标题: string
  价格: number
  地区: string
  图片: string
  链接: string
  所属关键词: string
  首次发现: string
  最近发现: string
  /** 是否发生过降价 */
  降价: boolean
  收藏: boolean
}

/** 商品列表查询条件 */
export interface 商品查询类型 {
  页码: number
  每页条数: number
  关键词?: string
  所属关键词?: string
  地区?: string
  最低价格?: number | null
  最高价格?: number | null
  只看降价?: boolean
  只看收藏?: boolean
}

/** 黑名单商品：删除时选择拉黑的商品，后端爬取到也不会再收录 */
export interface 黑名单商品类型 {
  /** 以商品ID作为主键 */
  id: string
  商品ID: string
  标题: string
  价格: number
  图片: string
  所属关键词: string
  加入时间: string
}

/** 降价商品（降价事件队列中的条目，用户确认后从列表移除） */
export interface 降价商品类型 {
  id: string
  标题: string
  当前价格: number
  上次价格: number
  降价幅度: number
  地区: string
  图片: string
  链接: string
  所属关键词: string
  发现时间: string
}

/** 一轮任务结束后的汇总通知（设备每轮只弹 1 条，不逐商品刷屏） */
export interface 汇总通知类型 {
  /** 本轮新商品数量 */
  上新数: number
  /** 本轮降价商品数量 */
  降价数: number
  /** 新商品标题预览（前 3 条） */
  上新预览: string[]
  /** 降价商品标题预览（前 3 条） */
  降价预览: string[]
}

/** 任务爬取实时进度（SSE「进度」事件：爬取开始/每页完成/结束时各推 1 条） */
export interface 爬取进度类型 {
  任务ID: string
  /** 当前任务搜索关键词 */
  关键词: string
  /** 已完成页码（0 表示爬取刚开始或刚结束） */
  页码: number
  /** 配置的翻页上限（实际页数受 hasNextPage 影响可能更少） */
  页数上限: number
  /** 累计命中（过滤后）条数 */
  累计命中: number
  /** 累计上新条数 */
  累计上新: number
  /** 累计降价条数 */
  累计降价: number
  /** 最近一页命中条数 */
  本页命中: number
  /** 是否进行中（false 表示该任务已结束，前端据此收起进度指示） */
  进行中: boolean
}

// ===================== 任务调度 =====================

/** 调度器整体状态（对应 LoopThread） */
export interface 调度状态类型 {
  运行中: boolean
  任务总数: number
  启用任务数: number
  /** 循环间隔秒数（对应 repeat_sleep） */
  间隔秒数: number
  /** 单次最大重试次数（对应 retry_max） */
  最大重试次数: number
  上次执行时间: string | null
  下次执行时间: string | null
}

export type 执行状态类型 = '成功' | '失败' | '重试中'

/** 单次任务执行记录 */
export interface 执行记录类型 {
  id: string
  任务ID: string
  任务名称: string
  开始时间: string
  耗时秒: number
  状态: 执行状态类型
  结果数: number
  新商品数: number
  推送数: number
  信息: string
}

// ===================== 推送 =====================

export type Token状态类型 = '正常' | '过期' | '未配置'

/** 微信公众号推送配置（对应 wechat_option.yaml 及 push 段） */
export interface 推送配置类型 {
  微信开关: boolean
  设备开关: boolean
  appID: string
  appSecret: string
  模板ID: string
  用户ID: string
  token状态: Token状态类型
}

/** 推送历史记录 */
export interface 推送记录类型 {
  id: string
  商品ID: string
  商品标题: string
  价格: number
  渠道: '微信公众号' | '设备'
  状态: '成功' | '失败'
  时间: string
}

// ===================== 系统设置 =====================

/** 全局系统配置（对应 option.yaml 全局段） */
export interface 系统配置类型 {
  /** 访问口令：仅占位预留，第一期不做校验 */
  访问口令: string
  使用代理: boolean
  随机指纹: boolean
  /** 代理池（对应 proxies） */
  代理列表: string[]
  /** 请求头原文（对应 headers，文本编辑） */
  请求头: string
  /** cookies 原文（对应 cookies，文本编辑） */
  cookies文本: string
  令牌状态: Token状态类型
}

// ===================== 数据看板 =====================

export interface 名称数量类型 {
  名称: string
  数量: number
}

export interface 区间数量类型 {
  区间: string
  数量: number
}

/** 看板汇总统计 */
export interface 看板统计类型 {
  任务总数: number
  启用任务数: number
  商品总数: number
  今日新增商品: number
  今日推送数: number
  降价商品数: number
  关键词分布: 名称数量类型[]
  价格区间分布: 区间数量类型[]
}
