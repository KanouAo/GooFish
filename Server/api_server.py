# -*- coding: utf-8 -*-

import json
import os
import re
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import spider
import task_store
import record_store
import config_manager
from ruamel.yaml import YAML
from utils import 偏移时间, 格式化时间

端口 = 8000
数据库锁 = threading.Lock()
路由表 = []  # [(方法, 编译后的正则, 处理器)]，按注册顺序匹配，静态路径必须先于参数路径注册

执行记录 = []
推送记录 = []
上次执行时间 = ''
推送配置 = {}
系统配置 = {'令牌状态': '正常'}


def 注册路由(方法: str, 模式: str, 处理器) -> None:
    """注册路由：把 /tasks/:id 形式的参数段编译为命名捕获组"""
    正则 = re.compile('^' + re.sub(r':([A-Za-z_][A-Za-z0-9_]*)', r'(?P<\1>[^/]+)', 模式) + '$')
    路由表.append((方法, 正则, 处理器))


# ===================== SSE 事件推送 =====================

事件队列 = []          # [{'序号': int, '类型': '上新'|'降价'|'汇总', '数据': dict, '时间': str}]
事件序号 = 0
事件锁 = threading.Lock()
SSE连接数 = 0          # 原子计数，反映前端是否在线

# 本轮收集器：一次循环轮次（或一次手动立即执行）内所有任务产生的上新/降价先攒在这里，
# 轮次结束后设备只发 1 条汇总通知，微信则逐条全部推送，避免系统通知频繁刷屏
本轮上新 = []
本轮降价 = []
收集锁 = threading.Lock()


def 推送事件(类型: str, 数据: dict) -> None:
    """产生一个 SSE 事件并入队，并把上新/降价条目追加到本轮收集器

    不再逐条发系统通知——系统通知统一由 结束收集并推送() 在轮次结束时汇总成 1 条
    """
    global 事件序号
    with 事件锁:
        事件序号 += 1
        事件 = {'序号': 事件序号, '类型': 类型, '数据': 数据, '时间': 格式化时间(datetime.now())}
        事件队列.append(事件)
        if len(事件队列) > 100:
            事件队列[:] = 事件队列[-100:]
    with 收集锁:
        if 类型 == '上新':
            本轮上新.append(数据)
        elif 类型 == '降价':
            本轮降价.append(数据)


def 开始收集本轮() -> None:
    """一轮任务开始前调用：清空上轮残留的上新/降价收集"""
    with 收集锁:
        本轮上新.clear()
        本轮降价.clear()


def 记录推送历史(商品ID: str, 商品标题: str, 价格, 渠道: str, 状态: str) -> None:
    """写一条推送历史（内存，不持久化）"""
    推送记录.insert(0, {
        'id': str(int(datetime.now().timestamp() * 1000)),
        '商品ID': 商品ID,
        '商品标题': 商品标题,
        '价格': 价格,
        '渠道': 渠道,
        '状态': 状态,
        '时间': 格式化时间(datetime.now()),
    })


def 推送微信全部(上新: list, 降价: list) -> None:
    """微信公众号逐条推送本轮全部上新与降价商品（每个商品都推）"""
    import wechat_service
    for 条目 in 上新:
        try:
            wechat_service.send_good(
                条目['id'], 条目['标题'], str(条目.get('价格', '')),
                条目.get('地区', ''), 条目.get('图片', ''), 条目.get('链接', ''),
            )
            记录推送历史(条目['id'], 条目['标题'], 条目.get('价格', 0), '微信公众号', '成功')
        except Exception as e:
            print(f"微信推送上新失败 {条目.get('id')}: {e}")
            记录推送历史(条目['id'], 条目['标题'], 条目.get('价格', 0), '微信公众号', '失败')
    for 条目 in 降价:
        try:
            wechat_service.send_good(
                条目['id'], 条目['标题'], str(条目.get('当前价格', '')),
                条目.get('地区', ''), 条目.get('图片', ''), 条目.get('链接', ''),
            )
            记录推送历史(条目['id'], 条目['标题'], 条目.get('当前价格', 0), '微信公众号', '成功')
        except Exception as e:
            print(f"微信推送降价失败 {条目.get('id')}: {e}")
            记录推送历史(条目['id'], 条目['标题'], 条目.get('当前价格', 0), '微信公众号', '失败')


def 结束收集并推送() -> None:
    """一轮任务结束后调用：设备汇总成 1 条通知，微信逐条全部推送，SSE 推 1 个汇总事件

    本轮没有任何上新/降价时什么都不做
    """
    with 收集锁:
        上新 = list(本轮上新)
        降价 = list(本轮降价)
    if not 上新 and not 降价:
        return
    汇总数据 = {
        '上新数': len(上新),
        '降价数': len(降价),
        '上新预览': [g.get('标题', '') for g in 上新[:3]],
        '降价预览': [g.get('标题', '') for g in 降价[:3]],
    }
    #  微信开关已迁移到 wechat_option.yaml 的 wechat_service（默认 false，配置好凭证后置 true 即全部推送）
    import wechat_service
    if wechat_service.微信推送是否开启():
        推送微信全部(上新, 降价)
    #  本地推送开关（option.yaml push.device，推送设置页可改）：关闭则不发 Windows 系统通知
    本地推送开启 = bool((config_manager.option or {}).get('push', {}).get('device', True))
    if 本地推送开启:
        try:
            import notify_service
            成功 = notify_service.发送汇总通知(汇总数据)
            记录推送历史('', '本轮汇总', 0, '设备', '成功' if 成功 else '失败')
        except Exception:
            pass
    #  SSE 在线前端监听「汇总」事件，只弹 1 条通知（汇总事件本身不进收集器）
    推送事件('汇总', 汇总数据)


# ---------- 查询参数取值小工具（与 handlers.ts 同名函数行为一致） ----------

def 取文本(值) -> str:
    return '' if 值 is None else str(值)


def 取数字(值):
    if 值 is None or 值 == '':
        return None
    try:
        return float(值)
    except (TypeError, ValueError):
        return None


def 取整数(值):
    数字 = 取数字(值)
    return None if 数字 is None else int(数字)


def 取布尔(值) -> bool:
    return 值 is True or 值 == 'true'


# ===================== 数据看板 =====================

价格区间定义 = [
    ('0-100', 0, 100),
    ('100-300', 100, 300),
    ('300-500', 300, 500),
    ('500-1000', 500, 1000),
    ('1000-2000', 1000, 2000),
    ('2000以上', 2000, float('inf')),
]


def 看板统计(参数, 查询, 体):
    今日前缀 = 格式化时间(datetime.now())[:10]
    商品列表 = record_store.商品列表

    关键词计数 = {}
    for 商品 in 商品列表:
        键 = 商品['所属关键词']
        关键词计数[键] = 关键词计数.get(键, 0) + 1

    全部任务 = task_store.读取全部()
    return {
        '任务总数': len(全部任务),
        '启用任务数': len([t for t in 全部任务 if t['启用']]),
        '商品总数': len(商品列表),
        '今日新增商品': len([g for g in 商品列表 if g['最近发现'][:10] == 今日前缀]),
        '今日推送数': len([p for p in 推送记录 if p['时间'][:10] == 今日前缀]),
        '降价商品数': len([g for g in 商品列表 if g['降价']]),
        '关键词分布': [{'名称': 名称, '数量': 数量} for 名称, 数量 in 关键词计数.items()],
        '价格区间分布': [
            {
                '区间': 区间,
                '数量': len([g for g in 商品列表 if 下限 <= g['价格'] < 上限]),
            }
            for 区间, 下限, 上限 in 价格区间定义
        ],
    }


# ===================== 搜索任务管理 =====================

def 任务列表查询(参数, 查询, 体):
    关键词 = 取文本(查询.get('关键词')).strip()
    启用状态文本 = 取文本(查询.get('启用状态'))
    # 任务筛选直接走任务存储（goods_tasks.yaml 缓存）
    return task_store.查询任务(关键词, 启用状态文本)


def 新建任务(参数, 查询, 体):
    return task_store.新增任务(体 or {})


def 更新任务(参数, 查询, 体):
    任务 = task_store.更新任务(参数['id'], 体 or {})
    # PUT 整体更新也可能携带 启用 字段：同步通知调度循环即时生效
    if 任务 is not None and isinstance(体, dict) and '启用' in 体:
        import scheduler_loop
        scheduler_loop.通知任务开关变更(参数['id'], bool(体['启用']))
    return 任务


def 删除任务(参数, 查询, 体):
    被删任务 = task_store.删除任务(参数['id'])
    # 删除任务时同步清空该任务已收录的商品记录（黑名单不受影响）
    关键词 = 被删任务['关键词']
    清空数量 = len([g for g in record_store.商品列表 if g['所属关键词'] == 关键词])
    record_store.商品列表 = [g for g in record_store.商品列表 if g['所属关键词'] != 关键词]
    return {'id': 参数['id'], '清空商品数': 清空数量}


def 切换任务状态(参数, 查询, 体):
    启用 = 取布尔((体 or {}).get('启用'))
    结果 = task_store.切换任务启用(参数['id'], 启用)
    #  通知调度循环：停用立即打断该任务的进行中爬取；启用立即唤醒等待开始执行
    import scheduler_loop
    scheduler_loop.通知任务开关变更(参数['id'], 启用)
    return 结果


# ===================== 真实搜索执行与结果处理 =====================

def 处理搜索结果(任务: dict, 原始商品列表: list) -> dict:
    """业务处理真实爬到的商品：词过滤、黑名单过滤、待处理入队、降级判断、事件推送"""
    必含词 = 任务.get('必含词') or []
    屏蔽词 = 任务.get('屏蔽词') or []
    黑名单ID = {b['商品ID'] for b in record_store.黑名单列表}
    已收录ID = {g['id'] for g in record_store.商品列表}
    待处理ID = {p['id'] for p in record_store.待处理列表}

    统计 = {'命中数': 0, '黑名单过滤数': 0, '新商品数': 0, '推送数': 0}
    现在 = 格式化时间(datetime.now())

    for 原始 in 原始商品列表:
        标题 = 原始['标题']
        # 等价展开
        # for 词 in 必含词:          # 挨个取出每个必含词
        # 词 in 标题             # 检查这个词是否出现在标题里（True/False）
        if 必含词 and not all(词 in 标题 for 词 in 必含词):
            continue
        if any(词 in 标题 for 词 in 屏蔽词):
            continue
        统计['命中数'] += 1
        商品ID = 原始['商品ID']
        if 商品ID in 黑名单ID:
            统计['黑名单过滤数'] += 1
            continue  # 拉黑商品：不收录、不进待处理

        新价格 = float(原始['价格'])
        if 商品ID in 已收录ID:
            # 已收录商品：刷新最近发现；价格下降则标记降价并入降价列表
            for 商品 in record_store.商品列表:
                if 商品['id'] == 商品ID:
                    商品['最近发现'] = 现在
                    旧价格 = 商品['价格']
                    if 新价格 < 旧价格:
                        降价条目 = {
                            'id': 商品ID,
                            '标题': 标题,
                            '当前价格': 新价格,
                            '上次价格': 旧价格,
                            '降价幅度': round(旧价格 - 新价格, 2),
                            '地区': 原始.get('地区', 商品.get('地区', '')),
                            '图片': 原始.get('图片', 商品.get('图片', '')),
                            '链接': 原始.get('链接', 商品.get('链接', '')),
                            '所属关键词': 任务['关键词'],
                            '发现时间': 现在,
                        }
                        if not any(d['id'] == 商品ID for d in record_store.降价列表):
                            record_store.降价列表.insert(0, 降价条目)
                            推送事件('降价', 降价条目)
                        商品['价格'] = 新价格
                        商品['降价'] = True
                        统计['推送数'] += 1
                    break
        elif 商品ID not in 待处理ID:
            # 新商品：同时进入商品列表（纳入正常管理）和待处理审核队列（提醒用户查看）
            新商品 = {
                'id': 商品ID,
                '标题': 标题,
                '价格': 新价格,
                '地区': 原始['地区'],
                '图片': 原始['图片'],
                '链接': 原始['链接'],
                '所属关键词': 任务['关键词'],
                '首次发现': 现在,
                '最近发现': 现在,
                '降价': False,
                '收藏': False,
            }
            record_store.商品列表.insert(0, 新商品)
            record_store.待处理列表.insert(0, 新商品)
            统计['新商品数'] += 1
            推送事件('上新', 新商品)

    return 统计


def 执行真实搜索(任务: dict, 中断检查=None) -> dict:
    """调用 spider 真实搜索并逐页实时完成业务处理，返回统一结果结构

    中断检查：透传给 spider，每页开爬前检测；返回 True 时立即停止翻页（UI 停用任务/停止调度）
    逐页实时处理：每页爬完立即过业务管线（词过滤/黑名单/待处理/降价判断）并推 SSE——
    网页 UI 在爬取过程中就能看到上新/降价与进度，不用等整个任务（可能数分钟）跑完
    锁粒度：网络爬取在锁外、仅每页的本地数据处理持数据库锁，避免爬取期间 HTTP API 被阻塞
    """
    页数上限 = max(1, min(int(任务.get('页数') or 1), 50))
    累计 = {'命中数': 0, '黑名单过滤数': 0, '新商品数': 0, '推送数': 0}

    def 推进度(页码: int, 统计=None, 进行中: bool = True) -> None:
        """推 1 条进度事件给网页 UI（爬取开始/每页完成/结束时各推一次）"""
        推送事件('进度', {
            '任务ID': 任务['id'],
            '关键词': 任务['关键词'],
            '页码': 页码,
            '页数上限': 页数上限,
            '累计命中': 累计['命中数'],
            '累计上新': 累计['新商品数'],
            '累计降价': 累计['推送数'],
            '本页命中': 统计['命中数'] if 统计 else 0,
            '本页上新': 统计['新商品数'] if 统计 else 0,
            '本页降价': 统计['推送数'] if 统计 else 0,
            '进行中': 进行中,
        })

    def 页处理(页码: int, 本页商品: list) -> None:
        """spider 每页解析完的回调：立即业务处理 + 推上新/降价事件 + 推进度"""
        with 数据库锁:
            统计 = 处理搜索结果(任务, 本页商品)
        for 键 in 累计:
            累计[键] += 统计.get(键, 0)
        推进度(页码, 统计)

    推进度(0)  # 起始进度：UI 立即显示「正在搜索」，避免第一页请求期间无反馈
    try:
        结果 = spider.执行搜索(任务, 中断检查=中断检查, 页结果回调=页处理)
    finally:
        # 结束进度：无论成功/失败/中断都收起前端进度指示
        推进度(0, 进行中=False)

    if not 结果['成功']:
        return {
            '任务ID': 任务['id'],
            '结果数': 0,
            '新商品数': 0,
            '推送数': 0,
            '成功': False,
            '信息': f"真实爬取失败：{结果['信息']}（请检查 cookies / 代理）",
        }
    return {
        '任务ID': 任务['id'],
        '结果数': 累计['命中数'],
        '新商品数': 累计['新商品数'],
        '推送数': 累计['推送数'],
        '成功': True,
        '信息': (
            f"真实爬取：命中 {累计['命中数']} 件"
            f"（黑名单过滤 {累计['黑名单过滤数']} 件），"
            f"新增 {累计['新商品数']} 件待审核，降价 {累计['推送数']} 件"
        ),
    }


# ===================== 商品数据管理 =====================

def 商品列表查询(参数, 查询, 体):
    页码 = 取整数(查询.get('页码')) or 1
    每页条数 = 取整数(查询.get('每页条数')) or 10
    标题关键词 = 取文本(查询.get('关键词')).strip()
    所属关键词 = 取文本(查询.get('所属关键词'))
    地区 = 取文本(查询.get('地区'))
    最低价格 = 取数字(查询.get('最低价格'))
    最高价格 = 取数字(查询.get('最高价格'))

    过滤后 = [
        g for g in record_store.商品列表
        if (not 标题关键词 or 标题关键词 in g['标题'])
        and (not 所属关键词 or g['所属关键词'] == 所属关键词)
        and (not 地区 or g['地区'] == 地区)
        and (最低价格 is None or g['价格'] >= 最低价格)
        and (最高价格 is None or g['价格'] <= 最高价格)
        and (not 取布尔(查询.get('只看降价')) or g['降价'])
        and (not 取布尔(查询.get('只看收藏')) or g['收藏'])
    ]
    #  各列表统一按价格从低到高排列
    过滤后.sort(key=lambda g: g['价格'])

    起始 = (页码 - 1) * 每页条数
    return {
        '列表': 过滤后[起始:起始 + 每页条数],
        '总数': len(过滤后),
        '页码': 页码,
        '每页条数': 每页条数,
    }


def 删除商品(参数, 查询, 体):
    商品列表 = record_store.商品列表
    for 索引, 商品 in enumerate(商品列表):
        if 商品['id'] == 参数['id']:
            商品列表.pop(索引)
            return {'id': 参数['id']}
    raise ValueError('商品不存在')


def 切换商品收藏(参数, 查询, 体):
    for 商品 in record_store.商品列表:
        if 商品['id'] == 参数['id']:
            商品['收藏'] = 取布尔((体 or {}).get('收藏'))
            return {'id': 商品['id'], '收藏': 商品['收藏']}
    raise ValueError('商品不存在')


# ===================== 黑名单 / 清空缓存 =====================

def 加入黑名单通用(商品: dict) -> None:
    """商品加入黑名单（去重）"""
    if not any(b['商品ID'] == 商品['id'] for b in record_store.黑名单列表):
        record_store.黑名单列表.insert(0, {
            'id': 商品['id'],
            '商品ID': 商品['id'],
            '标题': 商品['标题'],
            '价格': 商品['价格'],
            '图片': 商品['图片'],
            '所属关键词': 商品['所属关键词'],
            '加入时间': 格式化时间(datetime.now()),
        })


def 获取黑名单(参数, 查询, 体):
    所属关键词 = 取文本(查询.get('所属关键词'))
    结果 = [b for b in record_store.黑名单列表 if not 所属关键词 or b['所属关键词'] == 所属关键词]
    return sorted(结果, key=lambda g: g['价格'])


def 商品加入黑名单(参数, 查询, 体):
    商品列表 = record_store.商品列表
    for 索引, 商品 in enumerate(商品列表):
        if 商品['id'] == 参数['id']:
            商品列表.pop(索引)
            # 同时从待处理列表移除（新商品可能同时在两个列表）
            record_store.待处理列表 = [p for p in record_store.待处理列表 if p['id'] != 商品['id']]
            加入黑名单通用(商品)
            return {'id': 商品['id']}
    raise ValueError('商品不存在')


def 黑名单还原(参数, 查询, 体):
    黑名单 = record_store.黑名单列表
    for 索引, 记录 in enumerate(黑名单):
        if 记录['id'] == 参数['id']:
            被还原 = 黑名单.pop(索引)
            return {'id': 被还原['商品ID']}
    raise ValueError('黑名单记录不存在')


def 清空商品数据(参数, 查询, 体):
    清空数量 = len(record_store.商品列表)
    record_store.商品列表 = []
    return {'清空数量': 清空数量}


# ===================== 待处理审核 =====================

def 获取待处理(参数, 查询, 体):
    所属关键词 = 取文本(查询.get('所属关键词'))
    结果 = [g for g in record_store.待处理列表 if not 所属关键词 or g['所属关键词'] == 所属关键词]
    return sorted(结果, key=lambda g: g['价格'])


def 待处理收录(参数, 查询, 体):
    待处理 = record_store.待处理列表
    for 索引, 商品 in enumerate(待处理):
        if 商品['id'] == 参数['id']:
            待处理.pop(索引)
            if not any(g['id'] == 商品['id'] for g in record_store.商品列表):
                record_store.商品列表.insert(0, 商品)
            return {'id': 商品['id']}
    raise ValueError('待处理商品不存在')


def 待处理拉黑(参数, 查询, 体):
    待处理 = record_store.待处理列表
    for 索引, 商品 in enumerate(待处理):
        if 商品['id'] == 参数['id']:
            待处理.pop(索引)
            # 新商品同时在商品列表，拉黑时需从商品列表也移除
            record_store.商品列表 = [g for g in record_store.商品列表 if g['id'] != 商品['id']]
            加入黑名单通用(商品)
            return {'id': 商品['id']}
    raise ValueError('待处理商品不存在')


def 清空黑名单(参数, 查询, 体):
    清空数量 = len(record_store.黑名单列表)
    record_store.黑名单列表 = []
    return {'清空数量': 清空数量}


def 清空待处理(参数, 查询, 体):
    """一键清空新商品列表：等同批量确认，仅移除新到提醒标记
    商品已在商品列表中，不受影响（不拉黑、不删除）
    """
    清空数量 = len(record_store.待处理列表)
    record_store.待处理列表 = []
    return {'清空数量': 清空数量}


# ===================== 降价事件管理 =====================

def 获取降价列表(参数, 查询, 体):
    """返回降价事件列表，按当前价格升序；支持所属关键词筛选"""
    所属关键词 = 取文本(查询.get('所属关键词'))
    结果 = [d for d in record_store.降价列表 if not 所属关键词 or d['所属关键词'] == 所属关键词]
    return sorted(结果, key=lambda d: d['当前价格'])


def 确认降价(参数, 查询, 体):
    """用户确认降价：从降价列表移除，重置商品降价标记"""
    降价列表 = record_store.降价列表
    for 索引, 条目 in enumerate(降价列表):
        if 条目['id'] == 参数['id']:
            降价列表.pop(索引)
            # 重置对应商品的降价标记
            for 商品 in record_store.商品列表:
                if 商品['id'] == 参数['id']:
                    商品['降价'] = False
                    break
            return {'id': 参数['id']}
    raise ValueError('降价记录不存在')


# ===================== 爬取任务调度 =====================

def 构建调度状态():
    # 函数内导入避免与 scheduler_loop 形成循环导入
    import scheduler_loop
    全部任务 = task_store.读取全部()
    运行中 = scheduler_loop.循环是否运行()
    间隔 = config_manager.option.get('repeat_sleep', 1800) if config_manager.option else 1800
    重试 = config_manager.option.get('retry_max', 5) if config_manager.option else 5
    return {
        '运行中': 运行中,
        '任务总数': len(全部任务),
        '启用任务数': len([t for t in 全部任务 if t['启用']]),
        '间隔秒数': 间隔,
        '最大重试次数': 重试,
        '上次执行时间': 上次执行时间,
        '下次执行时间': 偏移时间(间隔 / 3600) if 运行中 else None,
    }


def 调度状态(参数, 查询, 体):
    return 构建调度状态()


def 启动调度(参数, 查询, 体):
    import scheduler_loop
    scheduler_loop.启动循环()  # 真实拉起后台循环线程
    return 构建调度状态()


def 停止调度(参数, 查询, 体):
    import scheduler_loop
    scheduler_loop.停止循环()  # 真实停止后台循环线程
    return 构建调度状态()


def 更新调度配置(参数, 查询, 体):
    体 = 体 or {}
    变更 = False
    if config_manager.option:
        if 体.get('间隔秒数') is not None:
            config_manager.option['repeat_sleep'] = 体['间隔秒数']
            变更 = True
        if 体.get('最大重试次数') is not None:
            config_manager.option['retry_max'] = 体['最大重试次数']
            变更 = True
    if 变更:
        config_manager.写回配置()
        # 打断循环线程当前等待，使新间隔立即生效
        import scheduler_loop
        scheduler_loop.通知配置变更()
    return 构建调度状态()


def 获取执行记录(参数, 查询, 体):
    return 执行记录


def 执行任务并记录(任务: dict, 中断检查=None) -> dict:
    """执行一次完整搜索管线并写入执行记录（不加锁、不落盘，由调用方统一处理）

    HTTP 立即执行与后台循环线程共用本函数，保证两条路径行为一致
    中断检查：透传给底层搜索，UI 停用任务/停止调度时立即打断爬取
    """
    global 上次执行时间
    起始时刻 = time.monotonic()
    结果 = 执行真实搜索(任务, 中断检查=中断检查)
    耗时秒 = round(time.monotonic() - 起始时刻, 1)
    新记录 = {
        'id': str(int(datetime.now().timestamp() * 1000)),
        '任务ID': 任务['id'],
        '任务名称': f"{任务['关键词']}蹲守",
        '开始时间': 格式化时间(datetime.now()),
        '耗时秒': 耗时秒,
        '状态': '成功' if 结果['成功'] else '失败',
        '结果数': 结果['结果数'],
        '新商品数': 结果['新商品数'],
        '推送数': 结果['推送数'],
        '信息': 结果['信息'],
    }
    执行记录.insert(0, 新记录)
    上次执行时间 = 新记录['开始时间']
    return 新记录


def 立即执行任务(参数, 查询, 体):
    任务 = task_store.根据ID取(参数['taskId'])
    if 任务 is None:
        raise ValueError('任务不存在')
    #  手动执行也走本轮收集：执行完只发 1 条汇总设备通知，微信开启则逐条全推
    开始收集本轮()
    新记录 = 执行任务并记录(任务)
    结束收集并推送()
    return 新记录


#  手动立即执行内部只在数据处理阶段持锁，需豁免分发请求的全局锁（否则重入死锁）
立即执行任务.跳过全局锁 = True


# ===================== 推送设置与记录 =====================

def 加载推送配置() -> None:
    """从 wechat yaml 加载推送配置到内存缓存（API 修改只改内存，不落盘）"""
    global 推送配置
    模块目录 = os.path.dirname(os.path.abspath(__file__))
    测试路径 = os.path.join(模块目录, 'test_wechat_option.yaml')
    正式路径 = os.path.join(模块目录, 'wechat_option.yaml')
    路径 = 测试路径 if os.path.exists(测试路径) else 正式路径
    数据 = {}
    if os.path.exists(路径):
        yaml = YAML(typ='rt')
        with open(路径, 'r', encoding='utf-8') as f:
            数据 = yaml.load(f) or {}
    推送配置 = {
        'appID': 数据.get('appID', ''),
        'appSecret': 数据.get('appsecret', ''),
        '模板ID': 数据.get('template_id', ''),
        '用户ID': 数据.get('userid', ''),
        'token状态': '正常' if 数据.get('token') else '未配置',
        #  微信开关随凭证一起从 wechat yaml 读取；本地推送开关来自 option.yaml 的 push.device（默认开）
        '微信开关': bool(数据.get('wechat_service', False)),
        '设备开关': bool((config_manager.option or {}).get('push', {}).get('device', True)),
    }


def 获取推送配置(参数, 查询, 体):
    if not 推送配置:
        加载推送配置()
    return 推送配置


def 更新推送配置(参数, 查询, 体):
    global 推送配置
    if not 推送配置:
        加载推送配置()
    推送配置 = {**推送配置, **(体 or {})}
    #  两个开关写回各自 yaml 落盘：微信开关→wechat yaml 的 wechat_service，本地开关→option yaml 的 push.device
    落盘推送开关(推送配置.get('微信开关'), 推送配置.get('设备开关'))
    return 推送配置


def 落盘推送开关(微信开关, 设备开关) -> None:
    """把推送开关持久化到配置文件（ruamel round-trip 保留注释与格式）

    微信开关随凭证存 wechat yaml；本地推送开关存 option.yaml 的 push.device
    """
    try:
        if isinstance(微信开关, bool):
            import wechat_service
            微信数据 = wechat_service.read_option(wechat_service.option_path)
            if 微信数据 is not None and 微信数据.get('wechat_service') != 微信开关:
                微信数据['wechat_service'] = 微信开关
                wechat_service.write_option(微信数据, wechat_service.option_path)
        if isinstance(设备开关, bool):
            if config_manager.option is None:
                config_manager.读取配置()
            push段 = config_manager.option.get('push')
            if not isinstance(push段, dict):
                push段 = {}
                config_manager.option['push'] = push段
            if push段.get('device') != 设备开关:
                push段['device'] = 设备开关
                config_manager.写回配置()
    except Exception as e:
        print(f'推送开关落盘失败: {e}')


def 获取推送记录(参数, 查询, 体):
    return 推送记录


# ===================== 系统设置 =====================

def 获取系统配置(参数, 查询, 体):
    if not config_manager.option:
        return dict(系统配置)
    return {
        'use_proxy': config_manager.option.get('use_proxy', False),
        'random_option': config_manager.option.get('random_option', False),
        'proxies': config_manager.option.get('proxies', []),
        'repeat_sleep': config_manager.option.get('repeat_sleep', 1800),
        'retry_max': config_manager.option.get('retry_max', 5),
        '令牌状态': 系统配置.get('令牌状态', '正常'),
    }


def 更新系统配置(参数, 查询, 体):
    体 = 体 or {}
    if config_manager.option:
        if 'use_proxy' in 体:
            config_manager.option['use_proxy'] = 体['use_proxy']
        if 'random_option' in 体:
            config_manager.option['random_option'] = 体['random_option']
        if 'proxies' in 体:
            config_manager.option['proxies'] = 体['proxies']
        if 'repeat_sleep' in 体:
            config_manager.option['repeat_sleep'] = 体['repeat_sleep']
        if 'retry_max' in 体:
            config_manager.option['retry_max'] = 体['retry_max']
        config_manager.写回配置()
    if '令牌状态' in 体:
        系统配置['令牌状态'] = 体['令牌状态']
    return 获取系统配置(None, None, None)


def 刷新令牌(参数, 查询, 体):
    系统配置['令牌状态'] = '正常'
    return 获取系统配置(None, None, None)


# ===================== 路由注册（顺序即匹配优先级：静态路径先于参数路径） =====================
#  注意：根路径 / 不注册 API 路由，由静态托管兜底返回前端页面（无静态资源时返回 JSON 服务信息）

注册路由('GET', '/dashboard/stats', 看板统计)

注册路由('GET', '/tasks', 任务列表查询)
注册路由('POST', '/tasks', 新建任务)
注册路由('PUT', '/tasks/:id', 更新任务)
注册路由('DELETE', '/tasks/:id', 删除任务)
注册路由('PATCH', '/tasks/:id/status', 切换任务状态)

注册路由('GET', '/goods', 商品列表查询)
注册路由('DELETE', '/goods/:id', 删除商品)
注册路由('PATCH', '/goods/:id/collect', 切换商品收藏)
注册路由('GET', '/goods/blacklist', 获取黑名单)
注册路由('POST', '/goods/:id/blacklist', 商品加入黑名单)
注册路由('POST', '/goods/blacklist/:id/restore', 黑名单还原)
注册路由('POST', '/goods/clear', 清空商品数据)
注册路由('GET', '/goods/pending', 获取待处理)
注册路由('POST', '/goods/pending/:id/accept', 待处理收录)
注册路由('POST', '/goods/pending/:id/blacklist', 待处理拉黑)
注册路由('GET', '/goods/price-drops', 获取降价列表)
注册路由('POST', '/goods/price-drops/:id/confirm', 确认降价)
注册路由('POST', '/goods/blacklist/clear', 清空黑名单)
注册路由('POST', '/goods/pending/clear', 清空待处理)

注册路由('GET', '/scheduler/status', 调度状态)
注册路由('POST', '/scheduler/start', 启动调度)
注册路由('POST', '/scheduler/stop', 停止调度)
注册路由('PUT', '/scheduler/config', 更新调度配置)
注册路由('GET', '/scheduler/records', 获取执行记录)
注册路由('POST', '/scheduler/run/:taskId', 立即执行任务)

注册路由('GET', '/push/config', 获取推送配置)
注册路由('PUT', '/push/config', 更新推送配置)
注册路由('GET', '/push/records', 获取推送记录)

注册路由('GET', '/settings', 获取系统配置)
注册路由('PUT', '/settings', 更新系统配置)
注册路由('POST', '/settings/refresh-token', 刷新令牌)


# ===================== good_record.json 持久化 =====================
# 结构：{商品列表, 黑名单列表, 待处理列表, 降价列表, 历史价格}
# 读写统一委托 record_store 模块


def 加载数据库() -> None:
    """启动时从 good_record.json 加载商品数据到 record_store"""
    record_store.加载()


def 保存数据库() -> None:
    """把商品相关数据写回 good_record.json（每次非查询写操作后自动调用）"""
    record_store.保存()


# ===================== HTTP 服务 =====================

# ===================== 前端静态托管（单端口部署：页面与接口同源，仅需开后端一个端口） =====================

def 找静态目录():
    """定位前端构建产物目录：打包产物用 Server 旁的 web/，开发机回退 Ui/dist；都无则返回 None"""
    模块目录 = os.path.dirname(os.path.abspath(__file__))
    候选 = [
        os.path.normpath(os.path.join(模块目录, '..', 'web')),         # 打包产物布局
        os.path.normpath(os.path.join(模块目录, '..', 'Ui', 'dist')),  # 开发布局（pnpm build 产物）
        os.path.normpath(os.path.join(模块目录, 'web')),               # 兜底
    ]
    for 目录 in 候选:
        if os.path.isdir(目录):
            return 目录
    return None


静态目录 = 找静态目录()

MIME表 = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.json': 'application/json; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.map': 'application/json; charset=utf-8',
}


def 读静态文件(路径: str):
    """读静态文件，返回 (字节, Content-Type, 可长缓存)；SPA 路由回退 index.html；无文件返回 None"""
    if not 静态目录:
        return None
    相对 = 路径.lstrip('/') or 'index.html'
    完整 = os.path.normpath(os.path.join(静态目录, 相对))
    # 防目录穿越：规范化后必须仍位于静态目录内部
    if not 完整.startswith(静态目录 + os.sep):
        return None
    if not os.path.isfile(完整):
        # 无扩展名的路径视为前端 SPA 路由（如 /tasks /goods），回退 index.html 由 React Router 接管
        if os.path.splitext(相对)[1]:
            return None
        完整 = os.path.join(静态目录, 'index.html')
        if not os.path.isfile(完整):
            return None
    扩展 = os.path.splitext(完整)[1].lower()
    # vite 构建的 assets 带内容哈希可长缓存；index.html 入口不缓存保证发版即生效
    可缓存 = 'assets' + os.sep in 完整 or '/assets/' in 相对
    with open(完整, 'rb') as f:
        return f.read(), MIME表.get(扩展, 'application/octet-stream'), 可缓存


def 健康检查载荷() -> dict:
    """纯后端部署（无静态资源目录）时访问根路径返回的服务信息，避免「接口不存在」的困惑"""
    return {
        '服务': '闲鱼蹲物后台 API',
        '版本': '0.2',
        '说明': '这是后端接口服务；检测到前端静态资源时会直接托管页面（单端口部署）',
        '接口示例': ['/scheduler/status', '/tasks', '/goods', '/events'],
    }


def 分发请求(方法: str, 路径: str, 查询: dict, 体):
    """按注册顺序匹配路由并调用处理器；处理器在锁内执行保证线程安全"""
    for 路由方法, 正则, 处理器 in 路由表:
        if 路由方法 != 方法:
            continue
        匹配 = 正则.match(路径)
        if 匹配:
            #  标记 跳过全局锁 的处理器（如立即执行任务）内部自行管理锁粒度，
            #  避免外层持锁包住长耗时网络爬取、阻塞其他接口
            if getattr(处理器, '跳过全局锁', False):
                结果 = 处理器(匹配.groupdict(), 查询, 体)
                if 方法 != 'GET':
                    保存数据库()  # 写操作成功后同步落盘
                return 结果
            with 数据库锁:
                结果 = 处理器(匹配.groupdict(), 查询, 体)
                if 方法 != 'GET':
                    保存数据库()  # 写操作成功后同步落盘
                return 结果
    raise LookupError(f'接口不存在: {方法} {路径}')


class 接口处理器(BaseHTTPRequestHandler):
    server_version = 'GooFishAPI/0.1'

    def _写响应(self, 载荷: dict, 状态码: int = 200) -> None:
        数据 = json.dumps(载荷, ensure_ascii=False).encode('utf-8')
        self.send_response(状态码)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(数据)))
        # 全放行 CORS，方便不开 vite 代理时直连调试
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        self.wfile.write(数据)

    def _处理SSE(self) -> None:
        """SSE 长连接：持续推送事件队列中的新事件，客户端断开时释放连接计数"""
        global SSE连接数
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'keep-alive')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        SSE连接数 += 1
        已推送序号 = 0  # 客户端已收到的最大事件序号

        try:
            # 先发连接确认注释（SSE 注释行以冒号开头，客户端忽略）
            self.wfile.write(b': connected\n\n')
            self.wfile.flush()

            while True:
                with 事件锁:
                    新事件 = [e for e in 事件队列 if e['序号'] > 已推送序号]
                for 事件 in 新事件:
                    payload = json.dumps(事件['数据'], ensure_ascii=False)
                    消息 = f"id: {事件['序号']}\nevent: {事件['类型']}\ndata: {payload}\n\n"
                    self.wfile.write(消息.encode('utf-8'))
                    self.wfile.flush()
                    已推送序号 = 事件['序号']
                time.sleep(1)  # 1 秒检查间隔
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass  # 客户端断开连接，正常退出
        finally:
            SSE连接数 -= 1

    def _写静态(self, 路径: str) -> bool:
        """托管前端静态文件：命中则完成响应并返回 True；未命中返回 False（维持 JSON 404）

        根路径 / 与无扩展名路径（SPA 路由）回退 index.html；纯后端部署时 / 返回 JSON 服务信息
        """
        静态 = 读静态文件(路径)
        if 静态 is None:
            if 路径 == '/':
                self._写响应(健康检查载荷())
                return True
            return False
        数据, 类型, 可缓存 = 静态
        self.send_response(200)
        self.send_header('Content-Type', 类型)
        self.send_header('Content-Length', str(len(数据)))
        #  带内容哈希的 assets 长缓存；index.html 入口 no-cache，保证更新发版立即生效
        self.send_header('Cache-Control', 'public, max-age=31536000, immutable' if 可缓存 else 'no-cache')
        self.end_headers()
        self.wfile.write(数据)
        return True

    def _处理请求(self, 方法: str) -> None:
        解析结果 = urlparse(self.path)
        路径 = 解析结果.path
        #  SSE 事件流端点：不走标准路由分发，直接流式响应
        if 方法 == 'GET' and 路径 == '/events':
            self._处理SSE()
            return
        #  浏览器导航请求（Accept 含 text/html）优先静态托管：SPA 路由与 API 同名（/tasks /goods /settings），
        #  不分流则地址栏直达/刷新会拿到 JSON 掉出页面；axios/fetch/curl 的 Accept 无 text/html 字面量不受影响
        if 方法 == 'GET' and 'text/html' in (self.headers.get('Accept') or ''):
            if self._写静态(路径):
                return
        # query 参数单值化（parse_qs 默认丢弃空值参数，与前端约定一致）
        查询 = {键: 值列表[0] for 键, 值列表 in parse_qs(解析结果.query).items()}

        体 = None
        # `self.headers.get('Content-Length')` 在请求头缺失时返回`None` ，`or 0` 把它兜成`0` （避免`int(None)` 直接崩溃）
        # or 0 不是简单的“返回布尔值”，而是返回第一个为真（truthy）的操作数；如果所有操作数都为假（falsy），则返回最后一个操作数
        内容长度 = int(self.headers.get('Content-Length') or 0)
        if 内容长度 > 0:
            # `rfile` 是框架提供的请求体输入流
            # `.decode('utf-8')` 把字节流转为字符串
            原始内容 = self.rfile.read(内容长度).decode('utf-8')
            if 原始内容:
                try:
                    体 = json.loads(原始内容)
                except json.JSONDecodeError:
                    体 = None

        try:
            结果 = 分发请求(方法, 路径, 查询, 体)
            self._写响应({'code': 0, 'message': 'ok', 'data': 结果})
        except LookupError:
            #  API 路由未命中：GET 请求尝试托管前端静态文件（单端口部署：页面与接口同源）
            if 方法 == 'GET' and self._写静态(路径):
                return
            self._写响应({'code': 1, 'message': f'接口不存在: {方法} {路径}', 'data': None}, 404)
        except Exception as 错误:  # 业务异常统一转为 code=1，HTTP 状态保持 200
            self._写响应({'code': 1, 'message': str(错误), 'data': None})

    # `http.server` 框架的 回调钩子 ，由框架在收到 HTTP 请求时自动调用
    def do_GET(self) -> None:
        self._处理请求('GET')

    def do_POST(self) -> None:
        self._处理请求('POST')

    def do_PUT(self) -> None:
        self._处理请求('PUT')

    def do_PATCH(self) -> None:
        self._处理请求('PATCH')

    def do_DELETE(self) -> None:
        self._处理请求('DELETE')

    def do_OPTIONS(self) -> None:
        # 预检请求直接放行
        # 在发出 真正的请求之前 ，会先发一个 OPTIONS 请求探路。只有当 do_OPTIONS 返回 204 且带上这三个头，才放行后续真实请求
        self.send_response(204)
        # 允许任意来源
        self.send_header('Access-Control-Allow-Origin', '*')
        # 声明允许哪些 HTTP 方法
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        # 声明允许哪些请求头
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def log_message(self, 格式, *参数) -> None:
        print(f'[{格式化时间(datetime.now())}] {格式 % 参数}')


def 创建并绑定服务():
    """仅创建并 bind HTTP 服务（不进入 serve），返回服务实例

    关键：bind 必须在循环调度线程启动之前完成——端口被占用（重复启动）时此处立即抛 OSError，
    循环线程根本不会被拉起，避免「先启动循环→bind失败→停止循环却无法中断当前多页爬取」的时序问题
    """
    # 关闭地址重用：Windows 下 SO_REUSEADDR 允许多进程绑定同一端口并都进入 serve_forever，
    # 导致重复启动时旧进程的 daemon 循环线程不退出、脱离 HTTP 变僵尸持续爬取；关闭后重复 bind 立即失败
    ThreadingHTTPServer.allow_reuse_address = False
    #  监听地址与端口从 option yaml 读取（server_host/server_port），未配置时回退 127.0.0.1:8000
    监听地址 = str(config_manager.option.get('server_host', '127.0.0.1')) if config_manager.option else '127.0.0.1'
    监听端口 = int(config_manager.option.get('server_port', 端口)) if config_manager.option else 端口
    服务 = ThreadingHTTPServer((监听地址, 监听端口), 接口处理器)
    print(f'闲鱼蹲物后台 API 已启动: http://{监听地址}:{监听端口}')
    if 静态目录:
        print(f'前端页面已托管: http://{监听地址}:{监听端口}/  （静态目录: {静态目录}）')
    print(f'商品数据持久化: {config_manager.商品记录路径}（写操作实时落盘）')
    return 服务


def 运行服务(服务) -> None:
    """在主线程阻塞运行已绑定的 HTTP 服务，Ctrl+C 时优雅关闭"""
    try:
        服务.serve_forever()
    except KeyboardInterrupt:
        print('\n服务已停止')
        服务.server_close()
