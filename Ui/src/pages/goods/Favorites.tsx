//  收藏页：只看已收藏的商品，支持所属任务筛选、取消收藏、拉黑

import { useCallback, useEffect, useState } from 'react'
import { App, Button, Table } from 'antd'
import type { TableProps } from 'antd'
import { StarFilled, StopOutlined } from '@ant-design/icons'
import { 切换商品收藏, 商品加入黑名单, 获取商品列表 } from '@/api/goods'
import { 获取任务列表 } from '@/api/task'
import type { 商品类型, 搜索任务类型 } from '@/types/biz'
import { 任务筛选栏, 商品列, 价格列 } from './共用'

export default function 收藏页() {
  const { message } = App.useApp()
  const [数据, set数据] = useState<商品类型[]>([])
  const [总数, set总数] = useState(0)
  const [页码, set页码] = useState(1)
  const [每页条数, set每页条数] = useState(10)
  const [加载中, set加载中] = useState(false)
  const [任务列表, set任务列表] = useState<搜索任务类型[]>([])
  const [所属关键词, set所属关键词] = useState<string>()

  const 加载 = useCallback(async (页: number, 条数: number, 关键词?: string) => {
    set加载中(true)
    try {
      const 结果 = await 获取商品列表({ 页码: 页, 每页条数: 条数, 只看收藏: true, 所属关键词: 关键词 })
      set数据(结果.列表)
      set总数(结果.总数)
    } finally {
      set加载中(false)
    }
  }, [])

  useEffect(() => {
    void 加载(页码, 每页条数, 所属关键词)
    获取任务列表().then(set任务列表).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [页码, 每页条数, 所属关键词])

  const 切换任务 = (值?: string) => { set页码(1); set所属关键词(值) }

  const 取消收藏 = async (记录: 商品类型) => {
    await 切换商品收藏(记录.id, false)
    message.success('已取消收藏')
    await 加载(页码, 每页条数, 所属关键词)
  }

  const 拉黑 = async (记录: 商品类型) => {
    await 商品加入黑名单(记录.id)
    message.success('已加入黑名单')
    await 加载(页码, 每页条数, 所属关键词)
  }

  const 列定义: TableProps<商品类型>['columns'] = [
    {
      title: '商品',
      key: '商品',
      ellipsis: true,
      render: (_, 记录) => 商品列(记录.标题, 记录.链接, 记录.所属关键词, 记录.图片),
    },
    { title: '价格', width: 120, sorter: (a, b) => a.价格 - b.价格, render: (_, 记录) => 价格列(记录.价格, 记录.降价) },
    { title: '地区', dataIndex: '地区', width: 80 },
    {
      title: '操作',
      width: 170,
      render: (_, 记录) => (
        <>
          <Button type="link" size="small" icon={<StarFilled style={{ color: '#fadb14' }} />} onClick={() => void 取消收藏(记录)}>
            取消收藏
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
      <div style={{ marginBottom: 16 }}>
        <任务筛选栏 任务列表={任务列表} 值={所属关键词} 变更={切换任务} />
      </div>
      <Table<商品类型>
        rowKey="id"
        columns={列定义}
        dataSource={数据}
        loading={加载中}
        pagination={{
          current: 页码,
          pageSize: 每页条数,
          total: 总数,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (页, 条数) => { set页码(页); set每页条数(条数) },
        }}
      />
    </div>
  )
}
