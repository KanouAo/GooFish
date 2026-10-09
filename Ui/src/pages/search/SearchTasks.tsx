//  搜索任务管理页：任务列表（筛选/启停/试跑）+ 抽屉表单（新建/编辑）+ 删除

import { useEffect, useState } from 'react'
import {
  App,
  Button,
  Checkbox,
  Col,
  Drawer,
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
import { PlusOutlined } from '@ant-design/icons'
import {
  删除任务,
  切换任务状态,
  新建任务,
  更新任务,
  获取任务列表,
  试跑任务,
} from '@/api/task'
import {
  快捷过滤选项,
  快捷过滤标签映射,
  发布天数选项,
  排序方式选项,
  卖家地区选项,
} from '@/constants/选项'
import type { 搜索任务表单类型, 搜索任务类型 } from '@/types/biz'

/** 表单默认值 */
const 取默认表单值 = (): 搜索任务表单类型 => ({
  关键词: '',
  必含词: [],
  屏蔽词: [],
  排序方式: '综合',
  价格最低: null,
  价格最高: null,
  发布天数: '',
  快捷过滤: [],
  卖家地区: '',
  页数: 1,
  每页条数: 30,
  启用: true,
  备注: '',
})

export default function 搜索任务页() {
  const { message } = App.useApp()

  const [列表, set列表] = useState<搜索任务类型[]>([])
  const [加载中, set加载中] = useState(false)
  const [查询词, set查询词] = useState('')
  const [状态过滤, set状态过滤] = useState<boolean | undefined>(undefined)

  // 编辑抽屉与表单
  const [抽屉打开, set抽屉打开] = useState(false)
  const [编辑ID, set编辑ID] = useState<string | null>(null)
  const [表单] = Form.useForm<搜索任务表单类型>()
  const [保存中, set保存中] = useState(false)
  const [试跑中ID, set试跑中ID] = useState<string | null>(null)

  /** 拉取任务列表 */
  const 加载列表 = async (条件?: { 关键词?: string; 启用状态?: boolean }) => {
    set加载中(true)
    try {
      set列表(await 获取任务列表(条件 ?? { 关键词: 查询词, 启用状态: 状态过滤 }))
    } finally {
      set加载中(false)
    }
  }

  useEffect(() => {
    void 加载列表({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 打开新建抽屉 */
  const 打开新建 = () => {
    set编辑ID(null)
    表单.resetFields()
    表单.setFieldsValue(取默认表单值())
    set抽屉打开(true)
  }

  /** 打开编辑抽屉 */
  const 打开编辑 = (记录: 搜索任务类型) => {
    set编辑ID(记录.id)
    表单.setFieldsValue({
      关键词: 记录.关键词,
      必含词: 记录.必含词,
      屏蔽词: 记录.屏蔽词,
      排序方式: 记录.排序方式,
      价格最低: 记录.价格最低,
      价格最高: 记录.价格最高,
      发布天数: 记录.发布天数,
      快捷过滤: 记录.快捷过滤,
      卖家地区: 记录.卖家地区,
      页数: 记录.页数,
      每页条数: 记录.每页条数,
      启用: 记录.启用,
      备注: 记录.备注,
    })
    set抽屉打开(true)
  }

  /** 保存（新建或更新） */
  const 保存任务 = async () => {
    const 值 = await 表单.validateFields()
    set保存中(true)
    try {
      if (编辑ID) {
        await 更新任务(编辑ID, 值)
        message.success('任务已更新')
      } else {
        await 新建任务(值)
        message.success('任务已创建')
      }
      set抽屉打开(false)
      await 加载列表()
    } finally {
      set保存中(false)
    }
  }

  /** 删除任务 */
  const 确认删除 = async (id: string) => {
    await 删除任务(id)
    message.success('任务已删除')
    await 加载列表()
  }

  /** 手动试跑一次 */
  const 执行试跑 = async (id: string) => {
    set试跑中ID(id)
    try {
      const 结果 = await 试跑任务(id)
      message.success(`${结果.信息}，命中 ${结果.结果数} 件，新商品 ${结果.新商品数} 件`)
    } finally {
      set试跑中ID(null)
    }
  }

  /** 切换启停 */
  const 切换启停 = async (记录: 搜索任务类型, 值: boolean) => {
    await 切换任务状态(记录.id, 值)
    message.success(`任务已${值 ? '启用' : '停用'}`)
    await 加载列表()
  }

  const 列定义: TableProps<搜索任务类型>['columns'] = [
    {
      title: '关键词',
      dataIndex: '关键词',
      width: 140,
      render: (_, 记录) => (
        <Space size={4}>
          <Typography.Link onClick={() => 打开编辑(记录)}>{记录.关键词}</Typography.Link>
          {记录.屏蔽词.length > 0 && (
            <Space size={2}>
              {记录.屏蔽词.map((词) => (
                <Tag key={词} color="red">
                  屏蔽:{词}
                </Tag>
              ))}
            </Space>
          )}
        </Space>
      ),
    },
    {
      title: '价格区间(元)',
      key: '价格',
      width: 130,
      render: (_, 记录) => `${记录.价格最低 ?? 0} ~ ${记录.价格最高 ?? '不限'}`,
    },
    { title: '排序', dataIndex: '排序方式', width: 90 },
    {
      title: '快捷过滤',
      dataIndex: '快捷过滤',
      width: 180,
      render: (值: string[]) =>
        值.length > 0 ? (
          <Space size={2} wrap>
            {值.map((v) => (
              <Tag key={v} color="orange">
                {快捷过滤标签映射[v] ?? v}
              </Tag>
            ))}
          </Space>
        ) : (
          '-'
        ),
    },
    {
      title: '地区',
      dataIndex: '卖家地区',
      width: 80,
      render: (值: string) => 值 || '-',
    },
    {
      title: '启用',
      dataIndex: '启用',
      width: 70,
      render: (_, 记录) => (
        <Switch
          size="small"
          checked={记录.启用}
          onChange={(值) => void 切换启停(记录, 值)}
        />
      ),
    },
    { title: '创建时间', dataIndex: '创建时间', width: 170 },
    {
      title: '操作',
      key: '操作',
      fixed: 'right',
      width: 190,
      render: (_, 记录) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            loading={试跑中ID === 记录.id}
            onClick={() => void 执行试跑(记录.id)}
          >
            试跑
          </Button>
          <Button type="link" size="small" onClick={() => 打开编辑(记录)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除该搜索任务？"
            description="删除后不可恢复"
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => void 确认删除(记录.id)}
          >
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={4} className="页面标题">
          搜索任务管理
        </Typography.Title>
        <p className="页面描述">配置蹲守关键词、价格区间与过滤条件，对应 option.yaml 的 good 列表</p>
      </div>

      {/* 查询工具栏 */}
      <Space wrap>
        <Input
          placeholder="搜索关键词/备注"
          allowClear
          value={查询词}
          style={{ width: 200 }}
          onChange={(e) => set查询词(e.target.value)}
          onPressEnter={() => void 加载列表()}
        />
        <Select<boolean, { label: string; value: boolean }>
          placeholder="启用状态"
          allowClear
          style={{ width: 120 }}
          value={状态过滤}
          onChange={(v) => set状态过滤(v)}
          options={[
            { label: '启用', value: true },
            { label: '停用', value: false },
          ]}
        />
        <Button type="primary" onClick={() => void 加载列表()}>
          查询
        </Button>
        <Button
          onClick={() => {
            set查询词('')
            set状态过滤(undefined)
            void 加载列表({})
          }}
        >
          重置
        </Button>
        <Button type="primary" ghost icon={<PlusOutlined />} onClick={打开新建}>
          新建任务
        </Button>
      </Space>

      <Table<搜索任务类型>
        rowKey="id"
        loading={加载中}
        columns={列定义}
        dataSource={列表}
        scroll={{ x: 1060 }}
        pagination={false}
      />

      {/* 新建/编辑抽屉 */}
      <Drawer
        title={编辑ID ? '编辑搜索任务' : '新建搜索任务'}
        width={440}
        open={抽屉打开}
        destroyOnClose
        onClose={() => set抽屉打开(false)}
        extra={
          <Space>
            <Button onClick={() => set抽屉打开(false)}>取消</Button>
            <Button type="primary" loading={保存中} onClick={() => void 保存任务()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form<搜索任务表单类型> form={表单} layout="vertical" initialValues={取默认表单值()}>
          <Form.Item
            name="关键词"
            label="搜索关键词"
            rules={[{ required: true, message: '请输入关键词' }]}
          >
            <Input placeholder="如：电脑" maxLength={30} />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="价格最低" label="最低价格（元）">
                <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="不限" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="价格最高" label="最高价格（元）">
                <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="不限" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="排序方式" label="排序方式">
                <Select options={排序方式选项} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="发布天数" label="发布时间">
                <Select options={发布天数选项} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="快捷过滤" label="快捷过滤">
            <Checkbox.Group
              options={快捷过滤选项.map((项) => ({ label: 项.label, value: 项.value }))}
            />
          </Form.Item>

          <Form.Item name="卖家地区" label="卖家地区">
            <Select options={卖家地区选项} />
          </Form.Item>

          <Form.Item name="必含词" label="必含词（标题须包含，预留能力）">
            <Select mode="tags" placeholder="输入后回车添加" tokenSeparators={[',', '，']} />
          </Form.Item>

          <Form.Item name="屏蔽词" label="屏蔽词（标题含此词则排除，预留能力）">
            <Select mode="tags" placeholder="输入后回车添加" tokenSeparators={[',', '，']} />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="页数" label="爬取页数">
                <InputNumber min={1} max={10} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="每页条数" label="每页条数">
                <InputNumber min={10} max={50} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="启用" label="启用任务" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item name="备注" label="备注">
            <Input.TextArea rows={2} maxLength={100} placeholder="给自己看的备注（选填）" />
          </Form.Item>
        </Form>
      </Drawer>
    </Space>
  )
}
