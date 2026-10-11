//  全局爬取进度指示器：任务爬取期间固定显示在左下角（右下角已被通知卡片占用）
//  - 订阅 store 的爬取进度（SSE「进度」事件驱动）
//  - 爬取未进行中时渲染 null，不占任何空间
//  - 旋转图标 + 实时页码/命中统计，让用户明确感知「正在工作、没有卡住」

import { SyncOutlined } from '@ant-design/icons'
import { Tag } from 'antd'
import { use应用Store } from '@/store/app'

export default function 爬取进度指示器() {
  const 进度 = use应用Store((s) => s.爬取进度)

  // 起始事件（页码 0）与结束事件（进行中 false）都正常显示/收起
  if (!进度?.进行中) return null

  return (
    <div
      style={{
        position: 'fixed',
        left: 16,
        bottom: 16,
        zIndex: 1000,
      }}
    >
      <Tag
        icon={<SyncOutlined spin />}
        color="processing"
        style={{ margin: 0, padding: '4px 10px', fontSize: 13 }}
      >
        {`正在搜索「${进度.关键词}」 第${进度.页码}/${进度.页数上限}页 · 已抓${进度.累计命中}条 · 上新${进度.累计上新} 降价${进度.累计降价}`}
      </Tag>
    </div>
  )
}
