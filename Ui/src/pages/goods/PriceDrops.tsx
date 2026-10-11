//  新降价页：降价事件队列，支持确认（移除事件）与收藏

import { useCallback, useEffect, useState } from 'react'
import { App, Button, Popconfirm, Table, Tag, Space } from 'antd'
import type { TableProps } from 'antd'
import { CheckOutlined, StarFilled, StarOutlined } from '@ant-design/icons'
import { 切换商品收藏, 获取降价列表, 确认降价 } from '@/api/goods'
import { 获取商品列表 } from '@/api/goods'
import { 获取任务列表 } from '@/api/task'
import { use应用Store } from '@/store/app'
import type { 降价商品类型, 搜索任务类型 } from '@/types/biz'
import { 任务筛选栏, 商品列 } from './共用'

export default function 新降价页() {
  const { message } = App.useApp()
  const [数据, set数据] = useState<降价商品类型[]>([])
  const [加载中, set加载中] = useState(false)
  const [任务列表, set任务列表] = useState<搜索任务类型[]>([])
  const [所属关键词, set所属关键词] = useState<string>()
  const [收藏集合, set收藏集合] = useState<Set<string>>(new Set())
  const 降价事件计数 = use应用Store((s) => s.降价事件计数)

  /** 加载降价列表 + 同步收藏状态（收藏存于商品列表） */
  const 加载 = useCallback(async (关键词?: string) => {
    set加载中(true)
    try {
      const [降价, 收藏商品] = await Promise.all([
        获取降价列表(关键词),
        获取商品列表({ 页码: 1, 每页条数: 9999, 只看收藏: true }),
      ])
      set数据(降价)
      set收藏集合(new Set(收藏商品.列表.map((g) => g.id)))
    } finally {
      set加载中(false)
    }
  }, [])

  useEffect(() => { void 加载(所属关键词) }, [加载, 所属关键词])
  useEffect(() => { 获取任务列表().then(set任务列表).catch(() => undefined) }, [])
  useEffect(() => { if (降价事件计数 > 0) void 加载(所属关键词) }, [降价事件计数, 加载, 所属关键词])

  const 切换任务 = (值?: string) => set所属关键词(值)

  const 确认 = async (记录: 降价商品类型) => {
    await 确认降价(记录.id)
    message.success('已确认，从降价列表移除')
    await 加载(所属关键词)
  }

  const 收藏 = async (记录: 降价商品类型, 值: boolean) => {
    await 切换商品收藏(记录.id, 值)
    await 加载(所属关键词)
  }

  const 列定义: TableProps<降价商品类型>['columns'] = [
    {
      title: '商品',
      key: '商品',
      ellipsis: true,
      render: (_, 记录) => 商品列(记录.标题, 记录.链接, 记录.所属关键词, 记录.图片),
    },
    {
      title: '价格',
      width: 160,
      sorter: (a, b) => a.当前价格 - b.当前价格,
      render: (_, 记录) => (
        <Space direction="vertical" size={2}>
          <span style={{ color: '#f5222d', fontWeight: 600 }}>¥{记录.当前价格}</span>
          <span style={{ color: '#999', fontSize: 12, textDecoration: 'line-through' }}>¥{记录.上次价格}</span>
          <Tag color="orange">降 ¥{记录.降价幅度}</Tag>
        </Space>
      ),
    },
    { title: '地区', dataIndex: '地区', width: 80 },
    {
      title: '收藏',
      width: 64,
      render: (_, 记录) =>
        收藏集合.has(记录.id) ? (
          <Button type="text" icon={<StarFilled style={{ color: '#fadb14' }} />} onClick={() => void 收藏(记录, false)} />
        ) : (
          <Button type="text" icon={<StarOutlined />} onClick={() => void 收藏(记录, true)} />
        ),
    },
    {
      title: '操作',
      width: 100,
      render: (_, 记录) => (
        <Popconfirm
          title="确认已知晓降价？"
          description="确认后从降价列表移除"
          okText="确认"
          cancelText="取消"
          onConfirm={() => void 确认(记录)}
        >
          <Button type="link" size="small" icon={<CheckOutlined />}>
            确认
          </Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <任务筛选栏 任务列表={任务列表} 值={所属关键词} 变更={切换任务} />
      </div>
      <Table<降价商品类型>
        rowKey="id"
        columns={列定义}
        dataSource={数据}
        loading={加载中}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
      />
    </div>
  )
}
