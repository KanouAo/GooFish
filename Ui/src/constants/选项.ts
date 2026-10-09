//  业务选项常量：下拉/多选的中文标签与后端英文标识映射

import type { 发布天数类型, 排序方式类型 } from '@/types/biz'

/** 快捷过滤选项（对应咸鱼 searchFilter.quickFilter） */
export const 快捷过滤选项 = [
  { label: '个人闲置', value: 'filterPersonal' },
  { label: '验货宝', value: 'filterAppraise' },
  { label: '验号担保', value: 'gameAccountInsurance' },
  { label: '包邮', value: 'filterFreePostage' },
  { label: '超赞鱼小铺', value: 'filterHighLevelYxpSeller' },
  { label: '全新', value: 'filterNew' },
  { label: '严选', value: 'inspectedPhone' },
  { label: '一键转卖', value: 'filterOneKeyResell' },
] as const

/** 排序方式选项 */
export const 排序方式选项: { label: string; value: 排序方式类型 }[] = [
  { label: '综合', value: '综合' },
  { label: '新降价', value: '新降价' },
  { label: '新发布', value: '新发布' },
  { label: '价格从低到高', value: '价格升序' },
  { label: '价格从高到低', value: '价格降序' },
]

/** 发布天数选项（对应 publishDays） */
export const 发布天数选项: { label: string; value: 发布天数类型 }[] = [
  { label: '不限', value: '' },
  { label: '近 1 天', value: '1' },
  { label: '近 3 天', value: '3' },
  { label: '近 7 天', value: '7' },
  { label: '近 14 天', value: '14' },
]

/** 常用卖家地区（对应 extraFilterValue.extraDivision） */
export const 卖家地区选项 = [
  { label: '不限', value: '' },
  { label: '江浙沪', value: '江浙沪' },
  { label: '京津冀', value: '京津冀' },
  { label: '珠三角', value: '珠三角' },
  { label: '川渝', value: '川渝' },
]

/** 快捷过滤英文标识 → 中文标签（表格 Tag 展示用） */
export const 快捷过滤标签映射: Record<string, string> = Object.fromEntries(
  快捷过滤选项.map((项) => [项.value, 项.label]),
)
