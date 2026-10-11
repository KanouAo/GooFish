//  应用根组件：全局主题（咸鱼橙）、中文语言包、路由表

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { App as AntdApp, ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import 主布局 from '@/layouts/MainLayout'
import 看板页 from '@/pages/dashboard/Dashboard'
import 商品列表页 from '@/pages/goods/GoodsList'
import 收藏页 from '@/pages/goods/Favorites'
import 待处理页 from '@/pages/goods/Pending'
import 新降价页 from '@/pages/goods/PriceDrops'
import 黑名单页 from '@/pages/goods/Blacklist'
import 推送页 from '@/pages/push/Push'
import 搜索任务页 from '@/pages/search/SearchTasks'
import 调度页 from '@/pages/scheduler/Scheduler'
import 设置页 from '@/pages/settings/Settings'

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          // 咸鱼品牌橙作为主色
          colorPrimary: '#fa541c',
          borderRadius: 8,
          fontSize: 14,
        },
      }}
    >
      <AntdApp>
        <BrowserRouter>
          <Routes>
            <Route element={<主布局 />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<看板页 />} />
              <Route path="/tasks" element={<搜索任务页 />} />
              <Route path="/favorites" element={<收藏页 />} />
              <Route path="/pending" element={<待处理页 />} />
              <Route path="/price-drops" element={<新降价页 />} />
              <Route path="/goods" element={<商品列表页 />} />
              <Route path="/blacklist" element={<黑名单页 />} />
              <Route path="/scheduler" element={<调度页 />} />
              <Route path="/push" element={<推送页 />} />
              <Route path="/settings" element={<设置页 />} />
              {/* 未知路径统一回到看板 */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  )
}
