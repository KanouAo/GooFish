#  爬取适配层：复用 main.py 的真实搜索能力（物品信息类），把前端搜索任务配置转换为
#  search_data 结构并执行搜索、解析商品；不涉及业务处理（黑名单/待处理/降价逻辑在 api_server.py）

import json
import random
import threading
import time

import main as 爬虫核心

# ===================== 初始化 =====================

_已初始化 = False
_初始化锁 = threading.Lock()


def 初始化爬虫() -> None:
    """api_server 启动时调用：加载配置、按配置随机化 cookies，并强制关闭推送"""
    global _已初始化
    with _初始化锁:
        if _已初始化:
            return
        爬虫核心.option = 爬虫核心.read_option_yaml()
        if 爬虫核心.option['random_option']:
            爬虫核心.set_random_option()
        # 用户尚未配置微信推送：无论配置文件当前值如何，一律强制关闭，避免真实测试误推送
        爬虫核心.option['push']['wechat_service'] = False
        爬虫核心.option['push']['device'] = False
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
    # 下排打勾过滤：逗号连接即可，结尾分号由 main.py 的 make_search_data 自动补
    快捷过滤 = 任务.get('快捷过滤') or []
    快捷串 = ','.join(快捷过滤)

    卖家地区 = str(任务.get('卖家地区') or '')
    if 卖家地区:
        # main.py 用 f-string 把该值直接嵌入 JSON 字符串位，内部双引号必须转义成 \"
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
        # 注意：必须是字符串 'true'——main.py 用 f-string 直接拼接进 JSON，Python 的 True 会渲染成非法 JSON 的 "True"
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

def 执行搜索(任务: dict) -> dict:
    """按任务配置真实请求咸鱼搜索接口，重试至最大次数后返回解析结果

    返回: {成功: bool, 信息: str, 商品列表: [{商品ID,标题,价格,地区,图片,链接}]}
    """
    初始化爬虫()
    搜索数据 = 构建搜索数据(任务)
    物品 = 爬虫核心.物品信息类(搜索数据)

    最大重试 = int(爬虫核心.option.get('retry_max', 5))
    信息 = ''
    for 次数 in range(最大重试):
        if 次数 > 0:
            # 启动时用假令牌，首次请求必返回「非法令牌」并自动续期写回配置文件；
            # 之后每次失败都随机停顿 1~2.5 秒再重试，5 次内拿到真实数据
            time.sleep(random.uniform(1, 2.5))
        信息 = 物品.get_page()
        if 信息 == '获得成功':
            break

    商品列表: list[dict] = []
    if 信息 == '获得成功':
        for 条目 in 物品.resultList:
            try:
                主信息 = 条目['data']['item']['main']
                详情参数 = 主信息['exContent']['detailParams']
                商品ID = str(详情参数['itemId'])
                # 图片与 main.py 一致取 exContent.picUrl（main 层级下没有 picUrl）
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
                continue  # 广告位等结构异常条目直接跳过
    return {'成功': 信息 == '获得成功', '信息': 信息, '商品列表': 商品列表}
