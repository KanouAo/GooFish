//  商品数据管理页：三个视图（商品列表 / 待处理审核 / 黑名单），支持按任务筛选、收录、拉黑与清空

import { useEffect, useState } from 'react'
import {
  App,
  Badge,
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
  Tabs,
  Tag,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import {
  CheckOutlined,
  RestOutlined,
  StarFilled,
  StarOutlined,
  StopOutlined,
  UndoOutlined,
} from '@ant-design/icons'
import {
  待处理收录,
  待处理拉黑,
  商品加入黑名单,
  清空商品数据,
  清空黑名单,
  切换商品收藏,
  获取商品列表,
  获取待处理列表,
  获取黑名单列表,
  黑名单还原,
} from '@/api/goods'
import { 获取任务列表 } from '@/api/task'
import type {
  分页结果类型,
  商品查询类型,
  商品类型,
  搜索任务类型,
  黑名单商品类型,
} from '@/types/biz'

/** 筛选表单字段 */
interface 筛选表单类型 {
  所属关键词?: string
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

  const [当前Tab, set当前Tab] = useState('goods')
  const [任务列表, set任务列表] = useState<搜索任务类型[]>([])

  const [数据, set数据] = useState<分页结果类型<商品类型>>({
    列表: [],
    总数: 0,
    页码: 1,
    每页条数: 10,
  })
  const [查询, set查询] = useState<商品查询类型>({ 页码: 1, 每页条数: 10 })
  const [加载中, set加载中] = useState(false)

  // 待处理审核
  const [待处理, set待处理] = useState<商品类型[]>([])
  const [待处理加载中, set待处理加载中] = useState(false)

  // 黑名单
  const [黑名单, set黑名单] = useState<黑名单商品类型[]>([])
  const [黑名单加载中, set黑名单加载中] = useState(false)

  /** 按查询条件加载分页数据 */
  const 加载数据 = async (条件: 商品查询类型) => {
    set加载中(true)
    try {
      set数据(await 获取商品列表(条件))
    } finally {
      set加载中(false)
    }
  }

  /** 加载待处理列表 */
  const 加载待处理 = async () => {
    set待处理加载中(true)
    try {
      set待处理(await 获取待处理列表())
    } finally {
      set待处理加载中(false)
    }
  }

  /** 加载黑名单 */
  const 加载黑名单 = async () => {
    set黑名单加载中(true)
    try {
      set黑名单(await 获取黑名单列表())
    } finally {
      set黑名单加载中(false)
    }
  }

  useEffect(() => {
    void 加载数据({ 页码: 1, 每页条数: 10 })
    void 加载待处理()
    void 加载黑名单()
    // 任务列表仅用于「所属任务」筛选选项
    获取任务列表()
      .then(set任务列表)
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 任务关键词筛选选项：已停用的任务追加标记，便于区分数据来源是否还会更新 */
  const 任务关键词选项 = 任务列表.map((任务) => ({
    label: 任务.启用 ? 任务.关键词 : `${任务.关键词}（已停用）`,
    value: 任务.关键词,
  }))

  /** 点击查询：取表单值合成查询条件，回到第一页；所属任务参数用于切换任务时自动查询 */
  const 执行查询 = async (所属任务覆盖?: string) => {
    const 值 = 筛选表单.getFieldsValue()
    const 新查询: 商品查询类型 = {
      页码: 1,
      每页条数: 查询.每页条数,
      所属关键词: (所属任务覆盖 ?? 值.所属关键词) || undefined,
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

  /** 商品列表中的商品加入黑名单 */
  const 拉黑商品 = async (记录: 商品类型) => {
    await 商品加入黑名单(记录.id)
    message.success('已加入黑名单，之后爬取到该商品也不会再收录')
    await Promise.all([加载数据(查询), 加载黑名单()])
  }

  /** 收录待处理商品 */
  const 收录待处理商品 = async (记录: 商品类型) => {
    await 待处理收录(记录.id)
    message.success('已收录进商品列表')
    await Promise.all([加载待处理(), 加载数据(查询)])
  }

  /** 拉黑待处理商品 */
  const 拉黑待处理商品 = async (记录: 商品类型) => {
    await 待处理拉黑(记录.id)
    message.success('已加入黑名单，之后爬取到该商品也不会再收录')
    await Promise.all([加载待处理(), 加载黑名单()])
  }

  /** 清空全部商品数据 */
  const 确认清空 = async () => {
    const 结果 = await 清空商品数据()
    message.success(`已清空 ${结果.清空数量} 条商品数据（黑名单不受影响）`)
    await 加载数据({ ...查询, 页码: 1 })
  }

  /** 从黑名单还原 */
  const 确认还原 = async (记录: 黑名单商品类型) => {
    await 黑名单还原(记录.id)
    message.success('已从黑名单还原，该商品重新允许被收录')
    await 加载黑名单()
  }

  /** 一键清空黑名单 */
  const 确认清空黑名单 = async () => {
    const 结果 = await 清空黑名单()
    message.success(`已清空 ${结果.清空数量} 条黑名单记录`)
    await 加载黑名单()
  }

  /** 切换收藏 */
  const 切换收藏 = async (记录: 商品类型, 值: boolean) => {
    await 切换商品收藏(记录.id, 值)
    await 加载数据(查询)
  }

  /** 商品图（原生 img 渲染最可靠；真实爬取可能缺图，空值时显示占位块） */
  const 商品图 = (值: string, 尺寸: number, 置灰?: boolean) =>
    值 ? (
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
    ) : (
      <div
        style={{
          width: 尺寸,
          height: 尺寸,
          borderRadius: 6,
          background: '#fff2e8',
          color: '#fa8c16',
          fontSize: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        暂无图
      </div>
    )

  const 列定义: TableProps<商品类型>['columns'] = [
    {
      title: '图片',
      dataIndex: '图片',
      width: 80,
      render: (值: string) => 商品图(值, 56),
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
      width: 90,
      render: (_, 记录) => (
        <Popconfirm
          title="确认加入黑名单？"
          description="该商品将从列表移除，之后爬取到也不会再收录"
          okText="拉黑"
          okButtonProps={{ danger: true }}
          cancelText="取消"
          onConfirm={() => void 拉黑商品(记录)}
        >
          <Button type="link" size="small" danger icon={<StopOutlined />}>
            拉黑
          </Button>
        </Popconfirm>
      ),
    },
  ]

  /** 待处理表列定义 */
  const 待处理列定义: TableProps<商品类型>['columns'] = [
    {
      title: '图片',
      dataIndex: '图片',
      width: 80,
      render: (值: string) => 商品图(值, 56),
    },
    {
      title: '商品',
      dataIndex: '标题',
      ellipsis: true,
      render: (值: string, 记录) => (
        <Space direction="vertical" size={2}>
          <Typography.Link href={记录.链接} target="_blank" rel="noreferrer" ellipsis>
            {值}
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
      width: 110,
      render: (值: number) => <span style={{ color: '#f5222d', fontWeight: 600 }}>¥{值}</span>,
    },
    { title: '地区', dataIndex: '地区', width: 80 },
    { title: '发现时间', dataIndex: '首次发现', width: 170 },
    {
      title: '操作',
      key: '操作',
      width: 150,
      render: (_, 记录) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            icon={<CheckOutlined />}
            onClick={() => void 收录待处理商品(记录)}
          >
            收录
          </Button>
          <Popconfirm
            title="确认加入黑名单？"
            description="该商品不会被收录，之后爬取到也不会再出现"
            okText="拉黑"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => void 拉黑待处理商品(记录)}
          >
            <Button type="link" size="small" danger icon={<StopOutlined />}>
              拉黑
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  /** 黑名单表列定义 */
  const 黑名单列定义: TableProps<黑名单商品类型>['columns'] = [
    {
      title: '图片',
      dataIndex: '图片',
      width: 80,
      render: (值: string) => 商品图(值, 48, true),
    },
    {
      title: '商品',
      dataIndex: '标题',
      ellipsis: true,
      render: (值: string, 记录) => (
        <Space direction="vertical" size={0}>
          <span>{值}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            商品ID：{记录.商品ID}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '价格',
      dataIndex: '价格',
      width: 100,
      render: (值: number) => <span style={{ color: '#f5222d' }}>¥{值}</span>,
    },
    { title: '所属关键词', dataIndex: '所属关键词', width: 110 },
    { title: '加入时间', dataIndex: '加入时间', width: 170 },
    {
      title: '操作',
      key: '操作',
      width: 90,
      render: (_, 记录) => (
        <Popconfirm
          title="确认从黑名单还原？"
          description="还原后该商品重新允许被收录，是否继续？"
          okText="还原"
          cancelText="取消"
          onConfirm={() => void 确认还原(记录)}
        >
          <Button type="link" size="small" icon={<UndoOutlined />}>
            还原
          </Button>
        </Popconfirm>
      ),
    },
  ]

  /** 商品列表 Tab 内容 */
  const 商品列表区 = (
    <>
      {/* 筛选区：切换所属任务自动查询，其余条件点查询生效 */}
      <Form<筛选表单类型> form={筛选表单} layout="vertical">
        <Row gutter={[12, 0]} align="bottom">
          <Col xs={24} sm={12} lg={5}>
            <Form.Item name="所属关键词" label="所属任务" style={{ marginBottom: 12 }}>
              <Select
                placeholder="全部任务"
                allowClear
                showSearch
                optionFilterProp="label"
                options={任务关键词选项}
                onChange={(值) => void 执行查询(值 ?? undefined)}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} lg={5}>
            <Form.Item name="关键词" label="标题关键词" style={{ marginBottom: 12 }}>
              <Input placeholder="商品标题包含" allowClear onPressEnter={() => void 执行查询()} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} lg={4}>
            <Form.Item name="地区" label="地区" style={{ marginBottom: 12 }}>
              <Select placeholder="全部地区" allowClear options={地区选项} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6} lg={3}>
            <Form.Item name="最低价格" label="最低价" style={{ marginBottom: 12 }}>
              <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="不限" />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6} lg={3}>
            <Form.Item name="最高价格" label="最高价" style={{ marginBottom: 12 }}>
              <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="不限" />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6} lg={2}>
            <Form.Item name="只看降价" label="降价" valuePropName="checked" style={{ marginBottom: 12 }}>
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6} lg={2}>
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
        <Popconfirm
          title="确认清空全部商品数据？"
          description="所有已收录商品记录将被删除，黑名单不受影响"
          okText="清空"
          okButtonProps={{ danger: true }}
          cancelText="取消"
          onConfirm={() => void 确认清空()}
        >
          <Button danger icon={<RestOutlined />}>
            清空商品数据
          </Button>
        </Popconfirm>
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
    </>
  )

  /** 待处理 Tab 内容 */
  const 待处理区 = (
    <div>
      <Typography.Paragraph type="secondary">
        试跑/立即执行新搜到的商品会先进入这里，由你决定收录进商品列表还是加入黑名单。
      </Typography.Paragraph>
      <Table<商品类型>
        rowKey="id"
        loading={待处理加载中}
        columns={待处理列定义}
        dataSource={待处理}
        scroll={{ x: 880 }}
        pagination={false}
      />
    </div>
  )

  /** 黑名单 Tab 内容 */
  const 黑名单区 = (
    <div>
      <Space wrap style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary">
          黑名单中的商品不会被收录；还原后重新允许收录，是否再次出现取决于之后的爬取结果。
        </Typography.Text>
        <Popconfirm
          title="确认清空黑名单？"
          description="清空后所有拉黑记录解除，这些商品将重新允许被收录"
          okText="清空"
          okButtonProps={{ danger: true }}
          cancelText="取消"
          onConfirm={() => void 确认清空黑名单()}
        >
          <Button danger size="small" icon={<RestOutlined />}>
            一键清空
          </Button>
        </Popconfirm>
      </Space>
      <Table<黑名单商品类型>
        rowKey="id"
        loading={黑名单加载中}
        columns={黑名单列定义}
        dataSource={黑名单}
        scroll={{ x: 800 }}
        pagination={false}
      />
    </div>
  )

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={4} className="页面标题">
          商品数据管理
        </Typography.Title>
        <p className="页面描述">
          已收录商品的查询与管理，新搜到的商品先在「待处理」中审核收录或拉黑（数据来自本地 Python 后端）
        </p>
      </div>

      <Tabs
        activeKey={当前Tab}
        onChange={set当前Tab}
        items={[
          { key: 'goods', label: '商品列表', children: 商品列表区 },
          {
            key: 'pending',
            label: (
              <span>
                待处理 <Badge count={待处理.length} size="small" color="#fa8c16" />
              </span>
            ),
            children: 待处理区,
          },
          {
            key: 'blacklist',
            label: (
              <span>
                黑名单 <Badge count={黑名单.length} size="small" color="#fa541c" />
              </span>
            ),
            children: 黑名单区,
          },
        ]}
      />
    </Space>
  )
}
