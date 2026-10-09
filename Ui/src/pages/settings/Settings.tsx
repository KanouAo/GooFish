//  系统设置页：访问口令占位、代理池、随机指纹、请求头/cookies 文本编辑、令牌刷新

import { useEffect, useState } from 'react'
import {
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { 更新系统配置, 获取系统配置, 刷新咸鱼令牌 } from '@/api/settings'
import type { 系统配置类型 } from '@/types/biz'

export default function 设置页() {
  const { message } = App.useApp()
  const [表单] = Form.useForm<系统配置类型>()
  const [加载中, set加载中] = useState(true)
  const [保存中, set保存中] = useState(false)
  const [令牌刷新中, set令牌刷新中] = useState(false)

  useEffect(() => {
    获取系统配置()
      .then((配置) => 表单.setFieldsValue(配置))
      .finally(() => set加载中(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 保存系统配置 */
  const 保存配置 = async () => {
    const 值 = await 表单.validateFields()
    set保存中(true)
    try {
      await 更新系统配置(值)
      message.success('系统配置已保存')
    } finally {
      set保存中(false)
    }
  }

  /** 手动刷新咸鱼令牌（模拟 make_token） */
  const 刷新令牌 = async () => {
    set令牌刷新中(true)
    try {
      const 最新配置 = await 刷新咸鱼令牌()
      表单.setFieldsValue(最新配置)
      message.success('咸鱼令牌已刷新')
    } finally {
      set令牌刷新中(false)
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={4} className="页面标题">
          系统设置
        </Typography.Title>
        <p className="页面描述">全局爬取参数与凭证配置（对应 option.yaml 全局段）</p>
      </div>

      <Card
        title="基础配置"
        loading={加载中}
        extra={
          <Space>
            <Tag
              color={
                表单.getFieldValue('令牌状态') === '正常'
                  ? 'green'
                  : 表单.getFieldValue('令牌状态') === '过期'
                    ? 'red'
                    : 'default'
              }
            >
              令牌：{表单.getFieldValue('令牌状态') || '缺失'}
            </Tag>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={令牌刷新中}
              onClick={() => void 刷新令牌()}
            >
              刷新令牌
            </Button>
          </Space>
        }
      >
        <Form<系统配置类型> form={表单} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} sm={12} lg={8}>
              <Form.Item
                name="访问口令"
                label="访问口令（预留）"
                tooltip="占位功能，当前版本不做校验，以后部署到公网时启用"
              >
                <Input.Password placeholder="设置后台访问口令（当前不生效）" autoComplete="new-password" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <Form.Item name="使用代理" label="使用代理 IP" valuePropName="checked">
                <Switch checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <Form.Item name="随机指纹" label="随机生成隐私指纹" valuePropName="checked">
                <Switch checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="代理列表"
            label="代理 IP 池"
            tooltip="格式 IP:端口，输入后回车添加（对应 proxies）"
          >
            <Select
              mode="tags"
              placeholder="如 39.107.249.241:3883，输入后回车添加"
              tokenSeparators={[',', '，']}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item name="请求头" label="请求头 Headers">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item name="cookies文本" label="Cookies">
            <Input.TextArea rows={4} />
          </Form.Item>

          <Button type="primary" loading={保存中} onClick={() => void 保存配置()}>
            保存设置
          </Button>
        </Form>
      </Card>
    </Space>
  )
}
