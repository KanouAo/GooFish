//  SSE 事件源 hook：连接后端 /api/events 长连接，监听上新/降价事件
//  - 页面可见：Ant Design 右下角非模态通知卡片，不抢焦点
//  - 页面在后台：浏览器系统通知（操作中心，不激活窗口、不影响全屏应用）
//  - 收到事件时更新 store 计数器，各页面监听计数器变化触发重新拉取数据

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { App } from 'antd'
import { use应用Store } from '@/store/app'
import type { 汇总通知类型, 爬取进度类型 } from '@/types/biz'
import { 后端基址, 订阅后端地址变更 } from '@/utils/后端地址'

export function use事件源() {
  const { notification } = App.useApp()
  const navigate = useNavigate()
  const 触发上新事件 = use应用Store((s) => s.触发上新事件)
  const 触发降价事件 = use应用Store((s) => s.触发降价事件)
  const 设置爬取进度 = use应用Store((s) => s.设置爬取进度)
  const 事件源Ref = useRef<EventSource | null>(null)
  // 窗口在后台时因系统通知权限未授予而没弹出的通知：等用户回到窗口后补一条页面内提示
  const 待补通知 = useRef<{ 标题: string; 描述: string; 路径: string } | null>(null)

  useEffect(() => {
    /**
     * 在用户手势（点击/按键）内请求通知权限：
     * 新版 Chrome/Edge 禁止页面加载时自动弹授权框，非手势 requestPermission 会被直接忽略，
     * 所以改为用户首次操作页面时发起，授权弹窗才能真正出现
     */
    const 手势内请求权限 = () => {
      if ('Notification' in window && Notification.permission === 'default') {
        void Notification.requestPermission()
      }
    }
    document.addEventListener('click', 手势内请求权限)
    document.addEventListener('keydown', 手势内请求权限)

    const 显示通知 = (标题: string, 描述: string, 路径: string) => {
      const 前往 = () => navigate(路径)
      // 窗口未激活：切走标签/最小化（hidden），或被其他程序遮挡、失去输入焦点（!hasFocus）
      const 窗口未激活 = document.hidden || !document.hasFocus()

      // 窗口在后台且已授权：发浏览器系统通知（操作中心提示，点击跳转）
      if (窗口未激活 && 'Notification' in window && Notification.permission === 'granted') {
        const 系统通知 = new Notification(标题, { body: 描述 })
        系统通知.onclick = () => {
          window.focus()
          前往()
          系统通知.close()
        }
        return
      }

      // 窗口在后台但系统通知权限没拿到（浏览器限制/用户曾拒绝）：
      // 先记住，等用户回到窗口时补一条页面内提示，避免这条动态彻底被漏掉
      if (窗口未激活 && 'Notification' in window && Notification.permission !== 'granted') {
        待补通知.current = { 标题, 描述, 路径 }
        console.warn(
          `[通知] 浏览器系统通知权限为「${Notification.permission}」，后台无法弹窗；回到页面后将补提示`,
        )
        return
      }

      // 窗口正激活：右下角非模态卡片，点击跳转，不阻塞、不抢焦点
      notification.info({
        message: 标题,
        description: 描述,
        placement: 'bottomRight',
        duration: 10,
        onClick: 前往,
      })
    }

    /** 窗口重新获得焦点：把后台期间没能弹出的通知补一条提示 */
    const 窗口重新聚焦 = () => {
      if (!document.hasFocus() || !待补通知.current) return
      const 通知内容 = 待补通知.current
      待补通知.current = null
      notification.warning({
        message: `${通知内容.标题}（系统通知未授权，回到页面后补提示）`,
        description: 通知内容.描述,
        placement: 'bottomRight',
        duration: 12,
        onClick: () => navigate(通知内容.路径),
      })
    }
    window.addEventListener('focus', 窗口重新聚焦)

    const 连接 = () => {
      //  重连前先关闭旧连接，避免重复事件
      事件源Ref.current?.close()
      //  事件地址实时读取系统设置保存的后端 IP/端口（未配置走 /api proxy）
      const es = new EventSource(`${后端基址()}/events`)
      事件源Ref.current = es

      // 上新/降价逐条事件只用于刷新页面数据与徽标，不逐商品弹通知
      es.addEventListener('上新', () => {
        触发上新事件()
      })

      es.addEventListener('降价', () => {
        触发降价事件()
      })

      // 爬取实时进度：任务开始/每页完成/结束时各推 1 条，驱动全局进度指示器（不弹通知）
      es.addEventListener('进度', (e: MessageEvent) => {
        const 数据 = JSON.parse(e.data) as 爬取进度类型
        设置爬取进度(数据)
      })

      // 一轮任务结束的「汇总」事件：设备每轮只弹这 1 条通知（页面后台为系统通知、可见为右下角卡片）
      es.addEventListener('汇总', (e: MessageEvent) => {
        const 数据 = JSON.parse(e.data) as 汇总通知类型
        触发上新事件()
        触发降价事件()
        const 预览 = [...数据.上新预览, ...数据.降价预览].slice(0, 3).join('；')
        const 描述 = `新商品 ${数据.上新数} 件，降价 ${数据.降价数} 件${预览 ? '：' + 预览 : ''}`
        显示通知('闲鱼蹲物：本轮有新动态', 描述, 数据.上新数 > 0 ? '/pending' : '/price-drops')
      })

      es.onerror = () => {
        es.close()
        // 3 秒后自动重连
        setTimeout(连接, 3000)
      }
    }

    连接()
    //  系统设置里修改后端 IP/端口后立即重连到新地址
    const 取消订阅 = 订阅后端地址变更(连接)

    return () => {
      取消订阅()
      事件源Ref.current?.close()
      document.removeEventListener('click', 手势内请求权限)
      document.removeEventListener('keydown', 手势内请求权限)
      window.removeEventListener('focus', 窗口重新聚焦)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
