//  ECharts 轻量封装：按需注册组件，自动 resize 与销毁，避免引入 echarts-for-react 的额外依赖

import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'

echarts.use([
  BarChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
])

interface 图表属性类型 {
  /** ECharts 配置项 */
  option: EChartsCoreOption
  /** 图表高度（px） */
  高度?: number
}

export default function 图表({ option, 高度 = 320 }: 图表属性类型) {
  const 容器引用 = useRef<HTMLDivElement>(null)
  const 实例引用 = useRef<echarts.ECharts | null>(null)

  // 仅在挂载时初始化一次，并监听容器尺寸变化
  useEffect(() => {
    if (!容器引用.current) return
    实例引用.current = echarts.init(容器引用.current)
    const 观察器 = new ResizeObserver(() => {
      实例引用.current?.resize()
    })
    观察器.observe(容器引用.current)
    return () => {
      观察器.disconnect()
      实例引用.current?.dispose()
      实例引用.current = null
    }
  }, [])

  // 配置变更时整体重绘
  useEffect(() => {
    实例引用.current?.setOption(option, true)
  }, [option])

  return <div ref={容器引用} style={{ width: '100%', height: `${高度}px` }} />
}
