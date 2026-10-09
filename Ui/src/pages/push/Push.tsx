//  推送设置页：微信公众号/设备开关与凭证配置 + 推送历史记录

import { useEffect, useState } from 'react'
import {
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  Row,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import { 获取推送记录, 获取推送配置, 更新推送配置 } from '@/api/push'
import type { 推送记录类型, 推送配置类型 } from '@/types/biz'

export default function 推送页() {
  const { message } = App.useApp()
  const [表单] = Form.useForm<推送配置类型>()
  const [记录列表, set记录列表] = useState<推送记录类型[]>([])
  const [加载中, set加载中] = useState(true)
  const [保存中, set保存中] = useState(false)

  useEffect(() => {
    Promise.all([获取推送配置(), 获取推送记录()])
      .then(([配置, 记录]) => {
        表单.setFieldsValue(配置)
        set记录列表(记录)
      })
      .finally(() => set加载中(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 保存推送配置 */
  const 保存配置 = async () => {
    const 值 = await 表单.validateFields()
    set保存中(true)
    try {
      await 更新推送配置(值)
      message.success('推送配置已保存')
    } finally {
      set保存中(false)
    }
  }

  /** 推送记录列定义 */
  const 列定义: TableProps<推送记录类型>['columns'] = [
    { title: '推送时间', dataIndex: '时间', width: 170 },
    {
      title: '商品',
      key: '商品',
      ellipsis: true,
      render: (_, 记录) => (
        <Space direction="vertical" size={0}>
          <span>{记录.商品标题}</span>
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
    {
      title: '渠道',
      dataIndex: '渠道',
      width: 110,
      render: (值: 推送记录类型['渠道']) => (
        <Tag color={值 === '微信公众号' ? 'green' : 'blue'}>{值}</Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: '状态',
      width: 90,
      render: (值: 推送记录类型['状态']) => (
        <Tag color={值 === '成功' ? 'green' : 'red'}>{值}</Tag>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={4} className="页面标题">
          推送设置
        </Typography.Title>
        <p className="页面描述">命中商品通过微信测试公众号模板消息推送给自己（对应 wechat_option.yaml）</p>
      </div>

      <Card title="推送渠道配置" loading={加载中}>
        <Form<推送配置类型> form={表单} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} sm={12} lg={6}>
              <Form.Item name="微信开关" label="微信公众号推送" valuePropName="checked">
                <Switch checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Form.Item name="设备开关" label="设备推送" valuePropName="checked">
                <Switch checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Form.Item label="Token 状态">
                <Form.Item name="token状态" noStyle>
                  <Input hidden />
                </Form.Item>
                <Tag
                  color={
                    表单.getFieldValue('token状态') === '正常'
                      ? 'green'
                      : 表单.getFieldValue('token状态') === '过期'
                        ? 'red'
                        : 'default'
                  }
                >
                  {表单.getFieldValue('token状态') || '未配置'}
                </Tag>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="appID"
                label="AppID"
                rules={[{ required: true, message: '请输入 AppID' }]}
              >
                <Input placeholder="微信测试公众号 AppID" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="appSecret"
                label="AppSecret"
                rules={[{ required: true, message: '请输入 AppSecret' }]}
              >
                <Input.Password placeholder="微信测试公众号 AppSecret" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="模板ID"
                label="模板消息 ID"
                rules={[{ required: true, message: '请输入模板 ID' }]}
              >
                <Input placeholder="模板消息 template_id" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="用户ID"
                label="接收用户 ID"
                rules={[{ required: true, message: '请输入用户 ID' }]}
              >
                <Input placeholder="关注公众号后的 openid" />
              </Form.Item>
            </Col>
          </Row>

          <Button type="primary" loading={保存中} onClick={() => void 保存配置()}>
            保存配置
          </Button>
        </Form>
      </Card>

      <Card title="推送历史记录">
        <Table<推送记录类型>
          rowKey="id"
          loading={加载中}
          columns={列定义}
          dataSource={记录列表}
          scroll={{ x: 760 }}
          pagination={{ pageSize: 10, showSizeChanger: false }}
        />
      </Card>
    </Space>
  )
}
