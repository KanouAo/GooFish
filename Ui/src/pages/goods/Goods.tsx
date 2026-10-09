//  商品数据管理页：服务端分页 + 条件筛选（关键词/地区/价格/降价/收藏）+ 删除/收藏

import { useEffect, useState } from 'react'
import {
  App,
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import { DeleteOutlined, StarFilled, StarOutlined } from '@ant-design/icons'
import { 删除商品, 切换商品收藏, 获取商品列表 } from '@/api/goods'
import type { 分页结果类型, 商品查询类型, 商品类型 } from '@/types/biz'

/** 筛选表单字段 */
interface 筛选表单类型 {
  关键词?: string
  地区?: string
  最低价格?: number | null
  最高价格?: number | null
  只看降价?: boolean
  只看收藏?: boolean
}

/** 地区筛选选项（与 Mock 种子地区池一致） */
const 地区选项 = ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '南京', '苏州', '重庆'].map(
  (名称) => ({ label: 名称, value: 名称 }),
)

export default function 商品页() {
  const { message } = App.useApp()
  const [筛选表单] = Form.useForm<筛选表单类型>()

  const [数据, set数据] = useState<分页结果类型<商品类型>>({
    列表: [],
    总数: 0,
    页码: 1,
    每页条数: 10,
  })
  const [查询, set查询] = useState<商品查询类型>({ 页码: 1, 每页条数: 10 })
  const [加载中, set加载中] = useState(false)

  /** 按查询条件加载分页数据 */
  const 加载数据 = async (条件: 商品查询类型) => {
    set加载中(true)
    try {
      set数据(await 获取商品列表(条件))
    } finally {
      set加载中(false)
    }
  }

  useEffect(() => {
    void 加载数据({ 页码: 1, 每页条数: 10 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 点击查询：取表单值合成查询条件，回到第一页 */
  const 执行查询 = async () => {
    const 值 = 筛选表单.getFieldsValue()
    const 新查询: 商品查询类型 = {
      页码: 1,
      每页条数: 查询.每页条数,
      关键词: 值.关键词?.trim() || undefined,
      地区: 值.地区 || undefined,
      最低价格: 值.最低价格 ?? null,
      最高价格: 值.最高价格 ?? null,
      只看降价: 值.只看降价 || false,
      只看收藏: 值.只看收藏 || false,
    }
    set查询(新查询)
    await 加载数据(新查询)
  }

  /** 重置筛选 */
  const 重置筛选 = async () => {
    筛选表单.resetFields()
    const 空查询: 商品查询类型 = { 页码: 1, 每页条数: 查询.每页条数 }
    set查询(空查询)
    await 加载数据(空查询)
  }

  /** 翻页 / 改变每页条数 */
  const 翻页 = async (页码: number, 每页条数: number) => {
    const 新查询 = { ...查询, 页码, 每页条数 }
    set查询(新查询)
    await 加载数据(新查询)
  }

  /** 删除商品 */
  const 确认删除 = async (id: string) => {
    await 删除商品(id)
    message.success('商品记录已删除')
    await 加载数据(查询)
  }

  /** 切换收藏 */
  const 切换收藏 = async (记录: 商品类型, 值: boolean) => {
    await 切换商品收藏(记录.id, 值)
    await 加载数据(查询)
  }

  const 列定义: TableProps<商品类型>['columns'] = [
    {
      title: '图片',
      dataIndex: '图片',
      width: 80,
      render: (值: string) => (
        // 使用原生 img：Mock 图片为内联 SVG data URI，原生渲染最可靠
        <img
          src={值}
          width={56}
          height={56}
          alt="商品图"
          style={{ objectFit: 'cover', borderRadius: 6, display: 'block' }}
        />
      ),
    },
    {
      title: '商品',
      key: '商品',
      ellipsis: true,
      render: (_, 记录) => (
        <Space direction="vertical" size={2}>
          <Typography.Link href={记录.链接} target="_blank" rel="noreferrer" ellipsis>
            {记录.标题}
          </Typography.Link>
          <Tag color="blue" style={{ marginInlineEnd: 0 }}>
            {记录.所属关键词}
          </Tag>
        </Space>
      ),
    },
    {
      title: '价格',
      dataIndex: '价格',
      width: 120,
      sorter: (a, b) => a.价格 - b.价格,
      render: (_, 记录) => (
        <Space size={4}>
          <span style={{ color: '#f5222d', fontWeight: 600 }}>¥{记录.价格}</span>
          {记录.降价 && <Tag color="orange">降价</Tag>}
        </Space>
      ),
    },
    { title: '地区', dataIndex: '地区', width: 80 },
    { title: '最近发现', dataIndex: '最近发现', width: 170 },
    {
      title: '收藏',
      dataIndex: '收藏',
      width: 64,
      render: (_, 记录) =>
        记录.收藏 ? (
          <Button
            type="text"
            icon={<StarFilled style={{ color: '#fadb14' }} />}
            onClick={() => void 切换收藏(记录, false)}
          />
        ) : (
          <Button
            type="text"
            icon={<StarOutlined />}
            onClick={() => void 切换收藏(记录, true)}
          />
        ),
    },
    {
      title: '操作',
      key: '操作',
      width: 80,
      render: (_, 记录) => (
        <Popconfirm
          title="确认删除该商品记录？"
          okText="删除"
          okButtonProps={{ danger: true }}
          cancelText="取消"
          onConfirm={() => void 确认删除(记录.id)}
        >
          <Button type="link" size="small" danger icon={<DeleteOutlined />}>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={4} className="页面标题">
          商品数据管理
        </Typography.Title>
        <p className="页面描述">已收录商品的查询与管理（数据待后端落库后对接，当前为 Mock 数据）</p>
      </div>

      {/* 筛选区 */}
      <Form<筛选表单类型> form={筛选表单} layout="vertical">
        <Row gutter={[12, 0]} align="bottom">
          <Col xs={24} sm={12} lg={6}>
            <Form.Item name="关键词" label="标题关键词" style={{ marginBottom: 12 }}>
              <Input placeholder="商品标题包含" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} lg={4}>
            <Form.Item name="地区" label="地区" style={{ marginBottom: 12 }}>
              <Select placeholder="全部地区" allowClear options={地区选项} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6} lg={4}>
            <Form.Item name="最低价格" label="最低价" style={{ marginBottom: 12 }}>
              <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="不限" />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6} lg={4}>
            <Form.Item name="最高价格" label="最高价" style={{ marginBottom: 12 }}>
              <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="不限" />
            </Form.Item>
          </Col>
          <Col xs={12} lg={3}>
            <Form.Item name="只看降价" label="降价" valuePropName="checked" style={{ marginBottom: 12 }}>
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={12} lg={3}>
            <Form.Item name="只看收藏" label="收藏" valuePropName="checked" style={{ marginBottom: 12 }}>
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      </Form>
      <Space wrap>
        <Button type="primary" onClick={() => void 执行查询()}>
          查询
        </Button>
        <Button onClick={() => void 重置筛选()}>重置</Button>
      </Space>

      <Table<商品类型>
        rowKey="id"
        loading={加载中}
        columns={列定义}
        dataSource={数据.列表}
        scroll={{ x: 920 }}
        pagination={{
          current: 数据.页码,
          pageSize: 数据.每页条数,
          total: 数据.总数,
          showSizeChanger: true,
          showTotal: (总数) => `共 ${总数} 条`,
          onChange: (页码, 每页) => void 翻页(页码, 每页),
        }}
      />
    </Space>
  )
}
