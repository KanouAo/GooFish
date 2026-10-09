//  看板统计卡片：图标 + 数值的统一展示单元
import { Card, Statistic } from 'antd'
import type { ReactNode } from 'react'

interface 统计卡片属性类型 {
  标题: string
  数值: number
  图标: ReactNode
  后缀?: string
  加载?: boolean
  /** 图标与数值的主题色 */
  主题色?: string
}

export default function 统计卡片({
  标题,
  数值,
  图标,
  后缀,
  加载,
  主题色 = '#fa541c',
}: 统计卡片属性类型) {
  return (
    <Card loading={加载}>
      <Statistic
        title={标题}
        value={数值}
        suffix={后缀}
        prefix={<span style={{ color: 主题色, marginInlineEnd: 8 }}>{图标}</span>}
      />
    </Card>
  )
}
