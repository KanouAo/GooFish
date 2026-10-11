//  黑名单页：拉黑商品管理，支持所属任务筛选、还原、一键清空

import { useCallback, useEffect, useState } from 'react'
import { App, Button, Popconfirm, Space, Table, Typography } from 'antd'
import type { TableProps } from 'antd'
import { RestOutlined, UndoOutlined } from '@ant-design/icons'
import { 获取黑名单列表, 黑名单还原, 清空黑名单 } from '@/api/goods'
import { 获取任务列表 } from '@/api/task'
import type { 黑名单商品类型, 搜索任务类型 } from '@/types/biz'
import { 任务筛选栏, 商品图 } from './共用'

export default function 黑名单页() {
  const { message } = App.useApp()
  const [数据, set数据] = useState<黑名单商品类型[]>([])
  const [加载中, set加载中] = useState(false)
  const [任务列表, set任务列表] = useState<搜索任务类型[]>([])
  const [所属关键词, set所属关键词] = useState<string>()

  const 加载 = useCallback(async (关键词?: string) => {
    set加载中(true)
    try {
      set数据(await 获取黑名单列表(关键词))
    } finally {
      set加载中(false)
    }
  }, [])

  useEffect(() => { void 加载(所属关键词) }, [加载, 所属关键词])
  useEffect(() => { 获取任务列表().then(set任务列表).catch(() => undefined) }, [])

  const 切换任务 = (值?: string) => set所属关键词(值)

  const 还原 = async (记录: 黑名单商品类型) => {
    await 黑名单还原(记录.id)
    message.success('已从黑名单还原，该商品重新允许被收录')
    await 加载(所属关键词)
  }

  const 一键清空 = async () => {
    const 结果 = await 清空黑名单()
    message.success(`已清空 ${结果.清空数量} 条黑名单记录`)
    await 加载(所属关键词)
  }

  const 列定义: TableProps<黑名单商品类型>['columns'] = [
    {
      title: '商品',
      key: '商品',
      ellipsis: true,
      render: (_, 记录) => (
        <Space size={12}>
          {商品图(记录.图片, 48, true)}
          <Space direction="vertical" size={0}>
            <Typography.Text delete type="secondary">{记录.标题}</Typography.Text>
            <Space size={4}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>¥{记录.价格}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{记录.所属关键词}</Typography.Text>
            </Space>
          </Space>
        </Space>
      ),
    },
    { title: '加入时间', dataIndex: '加入时间', width: 170 },
    {
      title: '操作',
      width: 100,
      render: (_, 记录) => (
        <Popconfirm
          title="确认还原？"
          description="还原后该商品重新允许被收录"
          okText="还原"
          cancelText="取消"
          onConfirm={() => void 还原(记录)}
        >
          <Button type="link" size="small" icon={<UndoOutlined />}>
            还原
          </Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <任务筛选栏 任务列表={任务列表} 值={所属关键词} 变更={切换任务} />
        <Popconfirm
          title="确认一键清空黑名单？"
          description="清空后所有拉黑记录解除"
          okText="清空"
          okButtonProps={{ danger: true }}
          cancelText="取消"
          onConfirm={() => void 一键清空()}
        >
          <Button danger icon={<RestOutlined />}>一键清空</Button>
        </Popconfirm>
      </Space>
      <Table<黑名单商品类型>
        rowKey="id"
        columns={列定义}
        dataSource={数据}
        loading={加载中}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
      />
    </div>
  )
}
