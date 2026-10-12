//  商品数据接口（对应 good_record.json 扩展数据）
import { 请求 } from '@/utils/request'
import type { 分页结果类型, 降价商品类型, 商品查询类型, 商品类型, 黑名单商品类型 } from '@/types/biz'

/** 分页查询商品（含关键词/地区/价格/降价/收藏筛选） */
export const 获取商品列表 = (查询: 商品查询类型) =>
  请求<分页结果类型<商品类型>>('/goods', {
    参数: 查询 as unknown as Record<string, unknown>,
  })

/** 删除商品记录 */
export const 删除商品 = (id: string) =>
  请求<{ id: string }>(`/goods/${id}`, { method: 'DELETE' })

/** 收藏/取消收藏 */
export const 切换商品收藏 = (id: string, 收藏: boolean) =>
  请求<{ id: string; 收藏: boolean }>(`/goods/${id}/collect`, {
    method: 'PATCH',
    data: { 收藏 },
  })

/** 获取黑名单列表（支持所属关键词筛选） */
export const 获取黑名单列表 = (所属关键词?: string) =>
  请求<黑名单商品类型[]>('/goods/blacklist', {
    参数: 所属关键词 ? { 所属关键词 } : undefined,
  })

/** 删除并加入黑名单：之后爬取到该商品也不再收录 */
export const 商品加入黑名单 = (id: string) =>
  请求<{ id: string }>(`/goods/${id}/blacklist`, { method: 'POST' })

/** 从黑名单还原：解除拉黑，商品重新允许被收录 */
export const 黑名单还原 = (id: string) =>
  请求<{ id: string }>(`/goods/blacklist/${id}/restore`, { method: 'POST' })

/** 清空全部商品数据 */
export const 清空商品数据 = () =>
  请求<{ 清空数量: number }>('/goods/clear', { method: 'POST' })

/** 获取新商品商品列表（新爬到、待人工审核；支持所属关键词筛选） */
export const 获取新商品列表 = (所属关键词?: string) =>
  请求<商品类型[]>('/goods/pending', {
    参数: 所属关键词 ? { 所属关键词 } : undefined,
  })

/** 新商品商品收录进商品列表 */
export const 新商品收录 = (id: string) =>
  请求<{ id: string }>(`/goods/pending/${id}/accept`, { method: 'POST' })

/** 新商品商品直接拉黑 */
export const 新商品拉黑 = (id: string) =>
  请求<{ id: string }>(`/goods/pending/${id}/blacklist`, { method: 'POST' })

/** 一键清空黑名单 */
export const 清空黑名单 = () =>
  请求<{ 清空数量: number }>('/goods/blacklist/clear', { method: 'POST' })

/** 一键清空新商品列表（等同批量确认，商品仍保留在商品列表） */
export const 清空新商品 = () =>
  请求<{ 清空数量: number }>('/goods/pending/clear', { method: 'POST' })

/** 获取降价商品列表（支持所属关键词筛选） */
export const 获取降价列表 = (所属关键词?: string) =>
  请求<降价商品类型[]>('/goods/price-drops', {
    参数: 所属关键词 ? { 所属关键词 } : undefined,
  })

/** 确认降价：从降价列表移除并重置商品降价标记 */
export const 确认降价 = (id: string) =>
  请求<{ id: string }>(`/goods/price-drops/${id}/confirm`, { method: 'POST' })
