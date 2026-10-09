//  商品数据接口（对应 good_record.json 扩展数据）
import { 请求 } from '@/utils/request'
import type { 分页结果类型, 商品查询类型, 商品类型 } from '@/types/biz'

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
