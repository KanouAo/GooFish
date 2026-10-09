//  数据看板页：核心指标卡片 + 关键词分布饼图 + 价格区间柱图；趋势图位置预留

import { useEffect, useState } from 'react'
import { Card, Col, Empty, Row, Space, Typography } from 'antd'
import {
  BellOutlined,
  FallOutlined,
  PlusOutlined,
  SearchOutlined,
  ShoppingOutlined,
} from '@ant-design/icons'
import type { EChartsCoreOption } from 'echarts/core'
import 图表 from '@/components/Chart'
import 统计卡片 from '@/components/StatCard'
import { 获取看板统计 } from '@/api/dashboard'
import type { 看板统计类型 } from '@/types/biz'

/** 图表配色（咸鱼橙为主的暖色系） */
const 图表配色 = ['#fa541c', '#fa8c16', '#fadb14', '#52c41a', '#13c2c2', '#1677ff', '#722ed1', '#eb2f96']

export default function 看板页() {
  const [统计, set统计] = useState<看板统计类型 | null>(null)
  const [加载中, set加载中] = useState(true)

  useEffect(() => {
    获取看板统计()
      .then(set统计)
      .finally(() => set加载中(false))
  }, [])

  /** 关键词命中分布饼图 */
  const 饼图配置: EChartsCoreOption = {
    color: 图表配色,
    tooltip: { trigger: 'item', formatter: '{b}: {c} 件 ({d}%)' },
    legend: { bottom: 0, type: 'scroll' },
    series: [
      {
        type: 'pie',
        radius: ['42%', '66%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        data: 统计?.关键词分布.map((项) => ({ name: 项.名称, value: 项.数量 })) ?? [],
      },
    ],
  }

  /** 价格区间分布柱图 */
  const 柱图配置: EChartsCoreOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 44, right: 20, top: 30, bottom: 36 },
    xAxis: {
      type: 'category',
      data: 统计?.价格区间分布.map((项) => 项.区间) ?? [],
      axisLabel: { interval: 0, fontSize: 11 },
    },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        type: 'bar',
        barMaxWidth: 40,
        itemStyle: { color: '#fa541c', borderRadius: [4, 4, 0, 0] },
        data: 统计?.价格区间分布.map((项) => 项.数量) ?? [],
      },
    ],
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={4} className="页面标题">
          数据看板
        </Typography.Title>
        <p className="页面描述">咸鱼增强搜索运行情况总览</p>
      </div>

      {/* 核心指标 */}
      <Row gutter={[12, 12]}>
        <Col xs={12} sm={8} lg={8} xl={4}>
          <统计卡片
            标题="搜索任务"
            数值={统计?.任务总数 ?? 0}
            后缀={`/ 启用 ${统计?.启用任务数 ?? 0}`}
            图标={<SearchOutlined />}
            加载={加载中}
            主题色="#1677ff"
          />
        </Col>
        <Col xs={12} sm={8} lg={8} xl={4}>
          <统计卡片
            标题="收录商品"
            数值={统计?.商品总数 ?? 0}
            图标={<ShoppingOutlined />}
            加载={加载中}
          />
        </Col>
        <Col xs={12} sm={8} lg={8} xl={4}>
          <统计卡片
            标题="今日新增"
            数值={统计?.今日新增商品 ?? 0}
            图标={<PlusOutlined />}
            加载={加载中}
            主题色="#52c41a"
          />
        </Col>
        <Col xs={12} sm={8} lg={8} xl={4}>
          <统计卡片
            标题="今日推送"
            数值={统计?.今日推送数 ?? 0}
            图标={<BellOutlined />}
            加载={加载中}
            主题色="#722ed1"
          />
        </Col>
        <Col xs={12} sm={8} lg={8} xl={4}>
          <统计卡片
            标题="降价商品"
            数值={统计?.降价商品数 ?? 0}
            图标={<FallOutlined />}
            加载={加载中}
            主题色="#fa8c16"
          />
        </Col>
        <Col xs={12} sm={8} lg={8} xl={4}>
          <Card>
            <Typography.Text type="secondary">数据更新</Typography.Text>
            <Typography.Title level={5} style={{ margin: '4px 0 0' }}>
              实时统计
            </Typography.Title>
          </Card>
        </Col>
      </Row>

      {/* 分布图 */}
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card title="关键词命中分布">
            <图表 option={饼图配置} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="商品价格区间分布（元）">
            <图表 option={柱图配置} />
          </Card>
        </Col>
      </Row>

      {/* 趋势图预留：待后端补充执行日志后开放 */}
      <Card title="爬取 / 推送趋势">
        <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty description="趋势统计待后端接入执行日志后开放（接口位：GET /dashboard/trend）" />
        </div>
      </Card>
    </Space>
  )
}
