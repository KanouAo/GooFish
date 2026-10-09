//  爬取任务调度页：调度状态卡片、启停控制、全局配置、任务立即执行、执行记录

import { useEffect, useState } from 'react'
import {
  App,
  Badge,
  Button,
  Card,
  Col,
  Form,
  InputNumber,
  Row,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import {
  PauseOutlined,
  ReloadOutlined,
  CaretRightOutlined,
} from '@ant-design/icons'
import {
  停止调度,
  启动调度,
  更新调度配置,
  获取执行记录,
  获取调度状态,
  立即执行任务,
} from '@/api/scheduler'
import { 获取任务列表 } from '@/api/task'
import { use应用Store } from '@/store/app'
import type {
  执行记录类型,
  搜索任务类型,
  调度状态类型,
} from '@/types/biz'

export default function 调度页() {
  const { message } = App.useApp()
  const 设置store调度状态 = use应用Store((s) => s.设置调度状态)

  const [状态, set状态] = useState<调度状态类型 | null>(null)
  const [记录列表, set记录列表] = useState<执行记录类型[]>([])
  const [任务列表, set任务列表] = useState<搜索任务类型[]>([])
  const [加载中, set加载中] = useState(true)
  const [执行中ID, set执行中ID] = useState<string | null>(null)
  const [配置保存中, set配置保存中] = useState(false)

  const [配置表单] = Form.useForm<{ 间隔秒数: number; 最大重试次数: number }>()

  /** 一次性拉取全部调度相关数据 */
  const 刷新全部 = async () => {
    set加载中(true)
    try {
      const [最新状态, 记录, 任务] = await Promise.all([
        获取调度状态(),
        获取执行记录(),
        获取任务列表(),
      ])
      set状态(最新状态)
      set记录列表(记录)
      set任务列表(任务)
      配置表单.setFieldsValue({
        间隔秒数: 最新状态.间隔秒数,
        最大重试次数: 最新状态.最大重试次数,
      })
      设置store调度状态(最新状态)
    } finally {
      set加载中(false)
    }
  }

  useEffect(() => {
    void 刷新全部()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 启动 / 停止调度循环 */
  const 切换运行 = async () => {
    const 最新状态 = 状态?.运行中 ? await 停止调度() : await 启动调度()
    set状态(最新状态)
    设置store调度状态(最新状态)
    message.success(`调度已${最新状态.运行中 ? '启动' : '停止'}`)
  }

  /** 保存全局调度配置 */
  const 保存配置 = async () => {
    const 值 = await 配置表单.validateFields()
    set配置保存中(true)
    try {
      const 最新状态 = await 更新调度配置(值)
      set状态(最新状态)
      设置store调度状态(最新状态)
      message.success('调度配置已保存')
    } finally {
      set配置保存中(false)
    }
  }

  /** 立即执行指定任务 */
  const 手动执行 = async (任务ID: string) => {
    set执行中ID(任务ID)
    try {
      const 新记录 = await 立即执行任务(任务ID)
      message.success(
        `命中 ${新记录.结果数} 件，新增 ${新记录.新商品数} 件已进入待处理，请在商品数据页审核`,
      )
      await 刷新全部()
    } finally {
      set执行中ID(null)
    }
  }

  /** 执行记录列定义 */
  const 记录列: TableProps<执行记录类型>['columns'] = [
    { title: '开始时间', dataIndex: '开始时间', width: 170 },
    { title: '任务', dataIndex: '任务名称', width: 130 },
    {
      title: '状态',
      dataIndex: '状态',
      width: 90,
      render: (值: 执行记录类型['状态']) => {
        const 颜色 = 值 === '成功' ? 'green' : 值 === '失败' ? 'red' : 'orange'
        return <Tag color={颜色}>{值}</Tag>
      },
    },
    { title: '耗时(秒)', dataIndex: '耗时秒', width: 90 },
    { title: '结果数', dataIndex: '结果数', width: 80 },
    { title: '待处理', dataIndex: '新商品数', width: 80 },
    { title: '推送数', dataIndex: '推送数', width: 80 },
    { title: '信息', dataIndex: '信息', ellipsis: true },
  ]

  /** 任务快捷操作列定义 */
  const 任务列: TableProps<搜索任务类型>['columns'] = [
    { title: '关键词', dataIndex: '关键词', width: 140 },
    {
      title: '状态',
      dataIndex: '启用',
      width: 90,
      render: (值: boolean) => (值 ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>),
    },
    { title: '排序', dataIndex: '排序方式', width: 110 },
    {
      title: '操作',
      key: '操作',
      render: (_, 记录) => (
        <Button
          type="primary"
          size="small"
          ghost
          icon={<CaretRightOutlined />}
          loading={执行中ID === 记录.id}
          disabled={!状态?.运行中}
          onClick={() => void 手动执行(记录.id)}
        >
          立即执行
        </Button>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={4} className="页面标题">
          任务调度
        </Typography.Title>
        <p className="页面描述">控制爬取循环、配置轮询节奏、查看执行记录（对应 LoopThread）</p>
      </div>

      {/* 调度状态卡片 */}
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card loading={加载中}>
            <Badge status={状态?.运行中 ? 'processing' : 'default'} text="运行状态" />
            <Typography.Title level={5} style={{ margin: '8px 0 0' }}>
              {状态?.运行中 ? '运行中' : '已停止'}
            </Typography.Title>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card loading={加载中}>
            <Typography.Text type="secondary">启用任务</Typography.Text>
            <Typography.Title level={5} style={{ margin: '8px 0 0' }}>
              {状态?.启用任务数 ?? 0} / {状态?.任务总数 ?? 0}
            </Typography.Title>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card loading={加载中}>
            <Typography.Text type="secondary">循环间隔</Typography.Text>
            <Typography.Title level={5} style={{ margin: '8px 0 0' }}>
              {状态 ? 状态.间隔秒数 / 60 : '-'} 分钟
            </Typography.Title>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={6}>
          <Card loading={加载中}>
            <Typography.Text type="secondary">上次执行</Typography.Text>
            <Typography.Title level={5} style={{ margin: '8px 0 0', fontSize: 15 }}>
              {状态?.上次执行时间 ?? '-'}
            </Typography.Title>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={6}>
          <Card loading={加载中}>
            <Typography.Text type="secondary">下次执行</Typography.Text>
            <Typography.Title level={5} style={{ margin: '8px 0 0', fontSize: 15 }}>
              {状态?.下次执行时间 ?? '-'}
            </Typography.Title>
          </Card>
        </Col>
      </Row>

      {/* 控制与全局配置 */}
      <Card title="调度控制与全局配置">
        <Row gutter={[16, 12]} align="middle" justify="space-between">
          <Col>
            <Form form={配置表单} layout="inline">
              <Form.Item
                name="间隔秒数"
                label="循环间隔(秒)"
                rules={[{ required: true, message: '请输入间隔' }]}
              >
                <InputNumber min={60} max={86400} precision={0} style={{ width: 120 }} />
              </Form.Item>
              <Form.Item
                name="最大重试次数"
                label="最大重试次数"
                rules={[{ required: true, message: '请输入重试次数' }]}
              >
                <InputNumber min={0} max={20} precision={0} style={{ width: 100 }} />
              </Form.Item>
              <Form.Item>
                <Button type="primary" loading={配置保存中} onClick={() => void 保存配置()}>
                  保存配置
                </Button>
              </Form.Item>
            </Form>
          </Col>
          <Col>
            <Space>
              <Button
                type="primary"
                danger={状态?.运行中}
                icon={状态?.运行中 ? <PauseOutlined /> : <CaretRightOutlined />}
                loading={加载中}
                onClick={() => void 切换运行()}
              >
                {状态?.运行中 ? '停止调度' : '启动调度'}
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => void 刷新全部()}>
                手动刷新
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 任务快捷执行 */}
      <Card title="任务快捷执行">
        <Table<搜索任务类型>
          rowKey="id"
          loading={加载中}
          columns={任务列}
          dataSource={任务列表}
          pagination={false}
        />
      </Card>

      {/* 执行记录 */}
      <Card title="执行记录">
        <Table<执行记录类型>
          rowKey="id"
          loading={加载中}
          columns={记录列}
          dataSource={记录列表}
          scroll={{ x: 960 }}
          pagination={{ pageSize: 10, showSizeChanger: false }}
        />
      </Card>
    </Space>
  )
}
