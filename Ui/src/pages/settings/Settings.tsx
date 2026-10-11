//  系统设置页：访问口令占位、代理池、随机指纹、请求头/cookies 文本编辑、令牌刷新

import { useEffect, useState } from 'react'
import {
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd'
import { ApiOutlined, ReloadOutlined } from '@ant-design/icons'
import { 更新系统配置, 获取系统配置, 刷新咸鱼令牌 } from '@/api/settings'
import type { 系统配置类型 } from '@/types/biz'
import {
  保存后端地址配置,
  读取后端地址配置,
  清除后端地址配置,
  默认后端IP,
  默认后端端口,
  type 后端地址配置类型,
} from '@/utils/后端地址'

export default function 设置页() {
  const { message } = App.useApp()
  const [表单] = Form.useForm<系统配置类型>()
  //  后台连接地址独立表单（仅存浏览器本地，不进后端 yaml）
  const [连接表单] = Form.useForm<后端地址配置类型>()
  const [加载中, set加载中] = useState(true)
  const [保存中, set保存中] = useState(false)
  const [令牌刷新中, set令牌刷新中] = useState(false)
  const [连接测试中, set连接测试中] = useState(false)
  //  是否已保存自定义后台地址：决定当前走直连还是 vite 代理
  const [已自定义地址, set已自定义地址] = useState(false)

  useEffect(() => {
    获取系统配置()
      .then((配置) => 表单.setFieldsValue(配置))
      .finally(() => set加载中(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  //  初始化后台连接地址表单：已保存则回填，未保存显示默认值（此时实际走 vite 代理）
  useEffect(() => {
    const 已保存 = 读取后端地址配置()
    set已自定义地址(已保存 !== null)
    连接表单.setFieldsValue(已保存 ?? { IP: 默认后端IP, 端口: 默认后端端口 })
  }, [连接表单])

  /** 保存后台连接地址（浏览器本地持久化，axios/SSE 立即生效） */
  const 保存连接地址 = async () => {
    const 值 = await 连接表单.validateFields()
    保存后端地址配置({ IP: 值.IP.trim(), 端口: Number(值.端口) })
    set已自定义地址(true)
    message.success('后台连接地址已保存，接口请求与事件通知立即使用新地址')
  }

  /** 用表单当前值测试后端连通性 */
  const 测试后台连接 = async () => {
    const 值 = await 连接表单.validateFields()
    set连接测试中(true)
    try {
      const 响应 = await fetch(
        `http://${值.IP.trim()}:${Number(值.端口)}/scheduler/status`,
      )
      if (!响应.ok) {
        throw new Error(String(响应.status))
      }
      const 体 = (await 响应.json()) as { code: number; message?: string }
      if (体.code === 0) {
        message.success('连接成功：后台服务正常')
      } else {
        throw new Error(体.message)
      }
    } catch {
      message.error('连接失败：请确认后台已启动，且 IP/端口与 option.yaml 一致')
    } finally {
      set连接测试中(false)
    }
  }

  /** 清除自定义地址，回退到 vite 代理模式 */
  const 恢复代理模式 = () => {
    清除后端地址配置()
    连接表单.setFieldsValue({ IP: 默认后端IP, 端口: 默认后端端口 })
    set已自定义地址(false)
    message.info('已清除自定义地址，回退到 Vite 代理模式')
  }

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
        title="后台连接地址"
        extra={
          <Tag color={已自定义地址 ? 'green' : 'blue'}>
            {已自定义地址 ? '直连模式' : 'Vite 代理模式'}
          </Tag>
        }
      >
        <Form form={连接表单} layout="vertical">
          <p style={{ marginTop: 0, color: '#888' }}>
            填写后台服务的 IP 和端口后保存，前端将直连该地址；必须与 option.yaml 的
            server_host/server_port 一致（后端改动需重启 main.py）。不填写则走 Vite 代理。
          </p>
          <Row gutter={16}>
            <Col xs={24} sm={12} lg={8}>
              <Form.Item
                name="IP"
                label="后台 IP"
                rules={[{ required: true, message: '请输入后台 IP' }]}
              >
                <Input placeholder="127.0.0.1" autoComplete="off" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <Form.Item
                name="端口"
                label="后台端口"
                rules={[{ required: true, message: '请输入后台端口' }]}
              >
                <InputNumber
                  min={1}
                  max={65535}
                  precision={0}
                  controls={false}
                  style={{ width: '100%' }}
                  placeholder="8000"
                />
              </Form.Item>
            </Col>
          </Row>
          <Space>
            <Button type="primary" onClick={() => void 保存连接地址()}>
              保存地址
            </Button>
            <Button
              icon={<ApiOutlined />}
              loading={连接测试中}
              onClick={() => void 测试后台连接()}
            >
              测试连接
            </Button>
            {已自定义地址 && <Button onClick={恢复代理模式}>恢复 Vite 代理</Button>}
          </Space>
        </Form>
      </Card>

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
