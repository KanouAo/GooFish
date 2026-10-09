//  后台主布局：左侧导航 + 顶栏 + 内容区；md 以下侧边栏转为抽屉，支持响应式

import { useEffect, useState, type ReactNode } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Avatar,
  Button,
  Drawer,
  Grid,
  Layout,
  Menu,
  Space,
  Tag,
  Typography,
} from 'antd'
import {
  BellOutlined,
  DashboardOutlined,
  MenuOutlined,
  SearchOutlined,
  SettingOutlined,
  ShoppingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { use应用Store } from '@/store/app'
import 样式 from './MainLayout.module.css'

const { Sider, Header, Content } = Layout
const { Title } = Typography

/** 导航菜单定义：key 即路由 path */
const 菜单项: { key: string; label: string; icon: ReactNode }[] = [
  { key: '/dashboard', label: '数据看板', icon: <DashboardOutlined /> },
  { key: '/tasks', label: '搜索任务', icon: <SearchOutlined /> },
  { key: '/goods', label: '商品数据', icon: <ShoppingOutlined /> },
  { key: '/scheduler', label: '任务调度', icon: <ThunderboltOutlined /> },
  { key: '/push', label: '推送设置', icon: <BellOutlined /> },
  { key: '/settings', label: '系统设置', icon: <SettingOutlined /> },
]

export default function 主布局() {
  const 屏幕断点 = Grid.useBreakpoint()
  const 桌面模式 = Boolean(屏幕断点.md)
  const [桌面折叠, set桌面折叠] = useState(false)
  const [抽屉打开, set抽屉打开] = useState(false)

  const navigate = useNavigate()
  const location = useLocation()
  const 调度状态 = use应用Store((s) => s.调度状态)
  const 加载调度状态 = use应用Store((s) => s.加载调度状态)

  // 首屏拉取调度状态，供顶栏徽标展示
  useEffect(() => {
    void 加载调度状态()
  }, [加载调度状态])

  const 当前路径 = '/' + (location.pathname.split('/')[1] ?? '')
  const 当前标题 = 菜单项.find((m) => m.key === 当前路径)?.label ?? ''

  /** 菜单跳转（点击后移动端自动收起抽屉） */
  const 菜单跳转 = (键: string) => {
    navigate(键)
    set抽屉打开(false)
  }

  const 菜单节点 = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[当前路径]}
      items={菜单项.map((项) => ({ key: 项.key, icon: 项.icon, label: 项.label }))}
      onClick={({ key }) => 菜单跳转(String(key))}
    />
  )

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 桌面端固定侧边栏 */}
      {桌面模式 && (
        <Sider
          trigger={null}
          collapsible
          collapsed={桌面折叠}
          width={210}
          style={{
            overflow: 'auto',
            height: '100vh',
            position: 'sticky',
            top: 0,
            left: 0,
          }}
        >
          <div className={样式.品牌区}>{桌面折叠 ? '咸鱼' : '咸鱼增强搜索'}</div>
          {菜单节点}
        </Sider>
      )}

      {/* 移动端抽屉导航 */}
      <Drawer
        placement="left"
        width={210}
        open={抽屉打开}
        closable={false}
        onClose={() => set抽屉打开(false)}
        styles={{ body: { padding: 0, background: '#001529' } }}
      >
        <div className={样式.品牌区}>咸鱼增强搜索</div>
        {菜单节点}
      </Drawer>

      <Layout style={{ background: '#f5f6f8' }}>
        <Header className={样式.顶栏}>
          <Space size={8}>
            <Button
              type="text"
              aria-label="菜单"
              icon={<MenuOutlined />}
              onClick={() =>
                桌面模式 ? set桌面折叠(!桌面折叠) : set抽屉打开(true)
              }
            />
            <Title level={5} style={{ margin: 0 }}>
              {当前标题}
            </Title>
          </Space>
          <Space size={12}>
            <Tag color={调度状态?.运行中 ? 'green' : 'default'} style={{ margin: 0 }}>
              {调度状态?.运行中 ? '调度运行中' : '调度已停止'}
            </Tag>
            <Avatar style={{ backgroundColor: '#fa541c' }}>管</Avatar>
          </Space>
        </Header>
        <Content className={样式.内容区}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
