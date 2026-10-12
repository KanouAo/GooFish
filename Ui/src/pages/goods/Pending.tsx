//  新商品页：最新爬到的商品（商品已进入商品列表，本页仅作新到提醒与快速操作）

import { useCallback, useEffect, useState } from 'react'
import { App, Button, Popconfirm, Space, Table } from 'antd'
import type { TableProps } from 'antd'
import { CheckOutlined, RestOutlined, StarFilled, StarOutlined, StopOutlined } from '@ant-design/icons'
import { 切换商品收藏, 获取新商品列表, 新商品收录, 新商品拉黑, 清空新商品 } from '@/api/goods'
import { 获取任务列表 } from '@/api/task'
import { use应用Store } from '@/store/app'
import type { 商品类型, 搜索任务类型 } from '@/types/biz'
import { 任务筛选栏, 商品列, 价格列 } from './共用'

export default function 新商品页() {
  const { message } = App.useApp()
  const [数据, set数据] = useState<商品类型[]>([])
  const [加载中, set加载中] = useState(false)
  const [任务列表, set任务列表] = useState<搜索任务类型[]>([])
  const [所属关键词, set所属关键词] = useState<string>()
  const 上新事件计数 = use应用Store((s) => s.上新事件计数)

  const 加载 = useCallback(async (关键词?: string) => {
    set加载中(true)
    try {
      set数据(await 获取新商品列表(关键词))
    } finally {
      set加载中(false)
    }
  }, [])

  useEffect(() => { void 加载(所属关键词) }, [加载, 所属关键词])
  useEffect(() => { 获取任务列表().then(set任务列表).catch(() => undefined) }, [])
  // SSE 上新事件触发自动刷新
  useEffect(() => { if (上新事件计数 > 0) void 加载(所属关键词) }, [上新事件计数, 加载, 所属关键词])

  const 切换任务 = (值?: string) => set所属关键词(值)

  /** 确认（已阅）：仅从新商品列表移除，商品仍在商品列表 */
  const 确认 = async (记录: 商品类型) => {
    await 新商品收录(记录.id)
    message.success('已确认，商品保留在商品列表')
    await 加载(所属关键词)
  }

  /** 收藏/取消收藏（作用于商品列表中的同一商品） */
  const 收藏 = async (记录: 商品类型, 值: boolean) => {
    await 切换商品收藏(记录.id, 值)
    await 加载(所属关键词)
  }

  const 拉黑 = async (记录: 商品类型) => {
    await 新商品拉黑(记录.id)
    message.success('已加入黑名单，商品列表中也已移除')
    await 加载(所属关键词)
  }

  /** 一键清空：全部标记为已确认，仅清本页提醒，商品仍在商品列表 */
  const 一键清空 = async () => {
    const 结果 = await 清空新商品()
    message.success(`已清空 ${结果.清空数量} 条新商品记录，商品仍保留在商品列表`)
    await 加载(所属关键词)
  }

  const 列定义: TableProps<商品类型>['columns'] = [
    {
      title: '商品',
      key: '商品',
      ellipsis: true,
      render: (_, 记录) => 商品列(记录.标题, 记录.链接, 记录.所属关键词, 记录.图片),
    },
    { title: '价格', width: 120, sorter: (a, b) => a.价格 - b.价格, render: (_, 记录) => 价格列(记录.价格) },
    { title: '地区', dataIndex: '地区', width: 80 },
    {
      title: '收藏',
      width: 64,
      render: (_, 记录) =>
        记录.收藏 ? (
          <Button type="text" icon={<StarFilled style={{ color: '#fadb14' }} />} onClick={() => void 收藏(记录, false)} />
        ) : (
          <Button type="text" icon={<StarOutlined />} onClick={() => void 收藏(记录, true)} />
        ),
    },
    {
      title: '操作',
      width: 160,
      render: (_, 记录) => (
        <>
          <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => void 确认(记录)}>
            确认
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<StopOutlined />}
            onClick={() => void 拉黑(记录)}
          >
            拉黑
          </Button>
        </>
      ),
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <任务筛选栏 任务列表={任务列表} 值={所属关键词} 变更={切换任务} />
        <Popconfirm
          title="确认一键清空新商品？"
          description="等同全部确认：仅清空本页提醒，商品仍保留在商品列表，不会拉黑"
          okText="清空"
          okButtonProps={{ danger: true }}
          cancelText="取消"
          onConfirm={() => void 一键清空()}
        >
          <Button danger icon={<RestOutlined />}>一键清空</Button>
        </Popconfirm>
      </Space>
      <Table<商品类型>
        rowKey="id"
        columns={列定义}
        dataSource={数据}
        loading={加载中}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
      />
    </div>
  )
}
