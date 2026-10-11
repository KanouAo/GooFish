//  商品页共享组件：所属任务筛选栏、商品图渲染、通用列定义辅助

import { Select, Space, Tag, Typography } from 'antd'
import type { 搜索任务类型 } from '@/types/biz'

/** 所属任务筛选下拉（各商品页共用，切换时自动触发查询） */
export function 任务筛选栏({
  任务列表,
  值,
  变更,
}: {
  任务列表: 搜索任务类型[]
  值?: string
  变更: (值?: string) => void
}) {
  return (
    <Select
      allowClear
      placeholder="选择所属任务筛选"
      style={{ width: 200 }}
      value={值}
      onChange={变更}
      options={任务列表.map((任务) => ({
        label: 任务.启用 ? 任务.关键词 : `${任务.关键词}（已停用）`,
        value: 任务.关键词,
      }))}
    />
  )
}

/** 商品图：原生 img 渲染内联 SVG 最可靠 */
export function 商品图(值: string, 尺寸: number, 置灰?: boolean) {
  return (
    <img
      src={值}
      width={尺寸}
      height={尺寸}
      alt="商品图"
      style={{
        objectFit: 'cover',
        borderRadius: 6,
        display: 'block',
        filter: 置灰 ? 'grayscale(0.8)' : undefined,
      }}
    />
  )
}

/** 商品列（图片 + 标题链接 + 关键词标签）—— 各页面列定义复用 */
export function 商品列(标题: string, 链接: string, 所属关键词: string, 图片: string, 置灰?: boolean) {
  return (
    <Space size={12}>
      {商品图(图片, 56, 置灰)}
      <Space direction="vertical" size={2}>
        <Typography.Link href={链接} target="_blank" rel="noreferrer" ellipsis>
          {标题}
        </Typography.Link>
        <Tag color="blue" style={{ marginInlineEnd: 0 }}>
          {所属关键词}
        </Tag>
      </Space>
    </Space>
  )
}

/** 价格列（带降价标记） */
export function 价格列(价格: number, 降价?: boolean, 上次价格?: number) {
  return (
    <Space direction="vertical" size={2}>
      <span style={{ color: '#f5222d', fontWeight: 600 }}>¥{价格}</span>
      {上次价格 !== undefined && (
        <span style={{ color: '#999', fontSize: 12, textDecoration: 'line-through' }}>¥{上次价格}</span>
      )}
      {降价 && <Tag color="orange">降价</Tag>}
    </Space>
  )
}
