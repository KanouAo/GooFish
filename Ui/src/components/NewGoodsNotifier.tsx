//  全局事件通知组件：通过 SSE 长连接接收上新/降价事件，实时推送通知
//  - 页面可见：Ant Design 右下角非模态通知卡片，不抢焦点
//  - 页面在后台：浏览器系统通知，不激活窗口、不影响全屏应用
//  - 布局路由内常驻，不随页面切换重挂载

import { use事件源 } from '@/hooks/use事件源'

export default function 上新通知() {
  use事件源()
  return null
}
