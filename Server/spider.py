#  爬取适配层：复用 search 的真实搜索能力（物品信息类），把前端搜索任务配置转换为
#  search_data 结构并执行搜索、解析商品；不涉及业务处理（黑名单/新商品/降价逻辑在 api_server.py）

import json
import random
import threading
import time

import config_manager as 配置
from search import 物品信息类

# ===================== 初始化 =====================

_已初始化 = False
_初始化锁 = threading.Lock()


def 初始化爬虫() -> None:
    """api_server 启动时调用：加载配置、按配置随机化 cookies，并强制关闭推送"""
    global _已初始化
    with _初始化锁:
        if _已初始化:
            return
        配置.读取配置()
        if 配置.option['random_option']:
            配置.随机化配置()
        # 微信是否推送完全由 wechat_option.yaml 的 wechat_service 决定，
        # 配置好凭证并把该开关置 true 后，每轮全部商品逐条推送；默认 false 不推
        _已初始化 = True


# ===================== 任务配置 -> search_data =====================

# 前端「排序方式」-> option.yaml 的 sortField
排序字段映射 = {'综合': '', '新降价': 'reduce', '新发布': 'create'}


def 构建搜索数据(任务: dict) -> dict:
    """将前端搜索任务字段转换为 物品信息类 需要的 search_data 结构"""
    关键词 = str(任务.get('关键词', '')).strip()
    排序字段 = 排序字段映射.get(str(任务.get('排序方式', '综合')), '')

    # 价格区间：空或 0 视为不限制（咸鱼接口用 undefined 表示）
    最低 = 任务.get('价格最低')
    最高 = 任务.get('价格最高')
    最低串 = 'undefined' if 最低 in (None, '', 0) else str(int(最低))
    最高串 = 'undefined' if 最高 in (None, '', 0) else str(int(最高))
    价格区间 = '' if 最低串 == 'undefined' and 最高串 == 'undefined' else f'{最低串},{最高串}'

    发布天数 = str(任务.get('发布天数') or '')
    # 下排打勾过滤：逗号连接即可，结尾分号由 search 的 构建搜索报文 自动补
    快捷过滤 = 任务.get('快捷过滤') or []
    快捷串 = ','.join(快捷过滤)

    卖家地区 = str(任务.get('卖家地区') or '')
    if 卖家地区:
        # search 用 f-string 把该值直接嵌入 JSON 字符串位，内部双引号必须转义成 \"
        额外过滤原文 = json.dumps(
            {'divisionList': [], 'excludeMultiPlacesSellers': '0', 'extraDivision': 卖家地区},
            ensure_ascii=False,
            separators=(',', ':'),
        )
        额外过滤 = 额外过滤原文.replace('"', '\\"')
    else:
        额外过滤 = '{}'

    return {
        'pageNumber': int(任务.get('页数') or 1),
        'keyword': 关键词,
        # 注意：必须是字符串 'true'——search 用 f-string 直接拼接进 JSON，Python 的 True 会渲染成非法 JSON 的 "True"
        'fromFilter': 'true',
        'rowsPerPage': 30,
        'sortValue': '',
        'sortField': 排序字段,
        'customDistance': '',
        'gps': '',
        'propValueStr': {
            'searchFilter': {
                'publishDays': 发布天数,
                'priceRange': 价格区间,
                'quickFilter': 快捷串,
            }
        },
        'customGps': '',
        'searchReqFromPage': 'pcSearch',
        'extraFilterValue': 额外过滤,
        'userPositionJson': '{}',
    }


# ===================== 执行搜索并解析 =====================

def 带重试请求搜索(物品: 物品信息类, 最大重试: int) -> str:
    """单页请求带重试：启动时假令牌首次必「非法令牌」并自动续期写回配置；
    之后每次失败随机停顿 1~2.5 秒再重试，最大次数内拿到真实数据"""
    信息 = ''
    for 次数 in range(最大重试):
        if 次数 > 0:
            time.sleep(random.uniform(1, 2.5))
        信息 = 物品.请求一页搜索结果()
        if 信息 == '获得成功':
            break
    return 信息


def 解析商品列表(物品: 物品信息类) -> list[dict]:
    """从单页响应中解析商品条目；广告位等结构异常条目直接跳过"""
    商品列表: list[dict] = []
    for 条目 in 物品.结果列表:
        try:
            主信息 = 条目['data']['item']['main']
            详情参数 = 主信息['exContent']['detailParams']
            商品ID = str(详情参数['itemId'])
            # 图片与旧版逻辑一致取 exContent.picUrl（main 层级下没有 picUrl）
            图片 = str(主信息['exContent'].get('picUrl', ''))
            if 图片.startswith('//'):
                图片 = 'https:' + 图片
            商品列表.append(
                {
                    '商品ID': 商品ID,
                    '标题': str(详情参数.get('title', '')),
                    '价格': float(详情参数.get('soldPrice', 0)),
                    '地区': str(主信息.get('area', '')),
                    '图片': 图片,
                    '链接': f'https://www.goofish.com/item?id={商品ID}',
                }
            )
        except (KeyError, TypeError, ValueError):
            continue
    return 商品列表


def 执行搜索(任务: dict, 中断检查=None, 页结果回调=None) -> dict:
    """按任务配置真实请求咸鱼搜索接口，支持多页翻页

    翻页上限 = min(任务.页数, 50)，且每页响应中 hasNextPage 为 False 时提前终止
    反爬策略：页与页之间随机停顿；某页重试耗尽则停止后续翻页，已得商品仍返回
    中断检查: 可选回调，返回 True 时立即停止翻页（UI 停用任务/停止调度时打断当前爬取），
              已抓取页的商品仍返回，不丢弃
    页结果回调: 可选回调 页结果回调(页码, 本页商品列表)，每页解析完成后立即调用，
              供上层实时做业务处理并向网页 UI 推进度/上新/降价，无需等整个任务爬完
    返回: {成功: bool, 信息: str, 商品列表: [{商品ID,标题,价格,地区,图片,链接}]}
    """
    初始化爬虫()
    页数 = max(1, min(int(任务.get('页数') or 1), 50))
    最大重试 = int(配置.option.get('retry_max', 5))

    全部商品: list[dict] = []
    信息 = '获得成功'
    已中断 = False
    for 页码 in range(1, 页数 + 1):
        # 每页开爬前检查中断：UI 停用任务或停止调度时立即打断，不再发起新请求
        if 中断检查 is not None and 中断检查():
            已中断 = True
            print(f'任务「{任务.get("关键词", "")}」爬取被中断，已抓取 {len(全部商品)} 条')
            break
        if 页码 > 1:
            # 翻页随机停顿，避免连续请求触发反爬
            time.sleep(random.uniform(1, 3))
        搜索数据 = 构建搜索数据(任务)
        搜索数据['pageNumber'] = 页码
        物品 = 物品信息类(搜索数据)
        信息 = 带重试请求搜索(物品, 最大重试)
        if 信息 != '获得成功':
            break  # 某页彻底失败：停止翻页，已抓到的页仍返回
        本页商品 = 解析商品列表(物品)
        全部商品.extend(本页商品)
        # 每页解析完立即回调上层：实时处理 + 推送进度，避免长任务期间 UI 无反馈
        if 页结果回调 is not None:
            页结果回调(页码, 本页商品)
        #  接口明确告知无下一页时提前终止，避免空页请求
        if not 物品.有下一页:
            break
    if 已中断:
        # 中断不算失败：已抓到的部分照常走业务处理
        return {
            '成功': True,
            '信息': '任务已停用中断' if not 全部商品 else f'任务已停用中断（已抓取 {len(全部商品)} 条）',
            '商品列表': 全部商品,
        }
    return {'成功': 信息 == '获得成功', '信息': 信息, '商品列表': 全部商品}
