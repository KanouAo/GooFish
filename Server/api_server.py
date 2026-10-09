# -*- coding: utf-8 -*-
"""闲鱼蹲物后台 API 服务（第一阶段：内存假数据，不真实爬取咸鱼）

- Python 标准库实现，零第三方依赖，与 main.py 真实爬虫相互独立
- 接口契约与前端 Ui/src/mock/handlers.ts 完全一致，统一响应 {code, message, data}
- 后续接真实逻辑时，逐条替换对应处理器即可（数据源从 fake_data.数据库 换成真实读写）

启动：python api_server.py  （监听 http://127.0.0.1:8000）
"""

import json
import os
import re
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import spider
from fake_data import 数据库, 偏移时间, 格式化时间, 生成新商品

端口 = 8000
数据库锁 = threading.Lock()
路由表 = []  # [(方法, 编译后的正则, 处理器)]，按注册顺序匹配，静态路径必须先于参数路径注册


def 注册路由(方法: str, 模式: str, 处理器) -> None:
    """注册路由：把 /tasks/:id 形式的参数段编译为命名捕获组"""
    正则 = re.compile('^' + re.sub(r':([A-Za-z_][A-Za-z0-9_]*)', r'(?P<\1>[^/]+)', 模式) + '$')
    路由表.append((方法, 正则, 处理器))


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
    商品列表 = 数据库['商品列表']

    关键词计数 = {}
    for 商品 in 商品列表:
        键 = 商品['所属关键词']
        关键词计数[键] = 关键词计数.get(键, 0) + 1

    return {
        '任务总数': len(数据库['任务列表']),
        '启用任务数': len([t for t in 数据库['任务列表'] if t['启用']]),
        '商品总数': len(商品列表),
        '今日新增商品': len([g for g in 商品列表 if g['最近发现'][:10] == 今日前缀]),
        '今日推送数': len([p for p in 数据库['推送记录'] if p['时间'][:10] == 今日前缀]),
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
    有状态过滤 = 启用状态文本 != ''
    结果 = []
    for 任务 in 数据库['任务列表']:
        if 关键词 and 关键词 not in 任务['关键词'] and 关键词 not in 任务['备注']:
            continue
        if 有状态过滤 and 任务['启用'] != (启用状态文本 == 'true'):
            continue
        结果.append(任务)
    return 结果


def 新建任务(参数, 查询, 体):
    表单 = 体 or {}
    最大编号 = max((int(t['id']) for t in 数据库['任务列表']), default=0)
    新任务 = {**表单, 'id': str(最大编号 + 1), '创建时间': 格式化时间(datetime.now())}
    数据库['任务列表'].append(新任务)
    return 新任务


def 更新任务(参数, 查询, 体):
    表单 = 体 or {}
    for 索引, 任务 in enumerate(数据库['任务列表']):
        if 任务['id'] == 参数['id']:
            新任务 = {**任务, **表单, 'id': 参数['id']}
            数据库['任务列表'][索引] = 新任务
            return 新任务
    raise ValueError('任务不存在')


def 删除任务(参数, 查询, 体):
    任务列表 = 数据库['任务列表']
    for 索引, 任务 in enumerate(任务列表):
        if 任务['id'] == 参数['id']:
            被删任务 = 任务列表.pop(索引)
            # 删除任务时同步清空该任务已收录的商品记录（黑名单不受影响）
            关键词 = 被删任务['关键词']
            清空数量 = len([g for g in 数据库['商品列表'] if g['所属关键词'] == 关键词])
            数据库['商品列表'] = [g for g in 数据库['商品列表'] if g['所属关键词'] != 关键词]
            return {'id': 参数['id'], '清空商品数': 清空数量}
    raise ValueError('任务不存在')


def 切换任务状态(参数, 查询, 体):
    for 任务 in 数据库['任务列表']:
        if 任务['id'] == 参数['id']:
            任务['启用'] = 取布尔((体 or {}).get('启用'))
            return {'id': 任务['id'], '启用': 任务['启用']}
    raise ValueError('任务不存在')


# ===================== 真实搜索执行与结果处理 =====================

def 处理搜索结果(任务: dict, 原始商品列表: list) -> dict:
    """业务处理真实爬到的商品：词过滤、黑名单过滤、待处理入队、降价判断、历史价格记录"""
    必含词 = 任务.get('必含词') or []
    屏蔽词 = 任务.get('屏蔽词') or []
    黑名单ID = {b['商品ID'] for b in 数据库['黑名单列表']}
    已收录ID = {g['id'] for g in 数据库['商品列表']}
    待处理ID = {p['id'] for p in 数据库['待处理列表']}

    统计 = {'命中数': 0, '黑名单过滤数': 0, '新商品数': 0, '推送数': 0}
    现在 = 格式化时间(datetime.now())

    for 原始 in 原始商品列表:
        标题 = 原始['标题']
        if 必含词 and not all(词 in 标题 for 词 in 必含词):
            continue
        if any(词 in 标题 for 词 in 屏蔽词):
            continue
        统计['命中数'] += 1
        商品ID = 原始['商品ID']
        if 商品ID in 黑名单ID:
            统计['黑名单过滤数'] += 1
            continue  # 拉黑商品：不收录、不进待处理、不记历史价格

        新价格 = float(原始['价格'])
        历史价 = 数据库['历史价格'].get(商品ID)
        if 商品ID in 已收录ID:
            # 已收录商品：刷新最近发现；价格低于历史价则标记降价
            for 商品 in 数据库['商品列表']:
                if 商品['id'] == 商品ID:
                    商品['最近发现'] = 现在
                    if 历史价 is not None and 新价格 < float(历史价):
                        商品['价格'] = 新价格
                        商品['降价'] = True
                        统计['推送数'] += 1  # 微信推送关闭时仅计数不实际推送
                    break
        elif 商品ID not in 待处理ID:
            # 新商品：进入待处理审核队列（收录或拉黑由用户决定）
            数据库['待处理列表'].insert(0, {
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
            })
            统计['新商品数'] += 1

        # 记录/更新历史价格（供下次降价判断）
        数据库['历史价格'][商品ID] = 新价格

    return 统计


def 执行真实搜索(任务: dict) -> dict:
    """调用 spider 真实搜索并完成业务处理，返回统一结果结构"""
    结果 = spider.执行搜索(任务)
    if not 结果['成功']:
        return {
            '任务ID': 任务['id'],
            '结果数': 0,
            '新商品数': 0,
            '推送数': 0,
            '成功': False,
            '信息': f"真实爬取失败：{结果['信息']}（请检查 cookies / 代理）",
        }
    统计 = 处理搜索结果(任务, 结果['商品列表'])
    return {
        '任务ID': 任务['id'],
        '结果数': 统计['命中数'],
        '新商品数': 统计['新商品数'],
        '推送数': 统计['推送数'],
        '成功': True,
        '信息': (
            f"真实爬取：命中 {统计['命中数']} 件"
            f"（黑名单过滤 {统计['黑名单过滤数']} 件），"
            f"新增 {统计['新商品数']} 件待审核，降价 {统计['推送数']} 件"
        ),
    }


def 试跑任务(参数, 查询, 体):
    for 任务 in 数据库['任务列表']:
        if 任务['id'] == 参数['id']:
            return 执行真实搜索(任务)
    raise ValueError('任务不存在')


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
        g for g in 数据库['商品列表']
        if (not 标题关键词 or 标题关键词 in g['标题'])
        and (not 所属关键词 or g['所属关键词'] == 所属关键词)
        and (not 地区 or g['地区'] == 地区)
        and (最低价格 is None or g['价格'] >= 最低价格)
        and (最高价格 is None or g['价格'] <= 最高价格)
        and (not 取布尔(查询.get('只看降价')) or g['降价'])
        and (not 取布尔(查询.get('只看收藏')) or g['收藏'])
    ]

    起始 = (页码 - 1) * 每页条数
    return {
        '列表': 过滤后[起始:起始 + 每页条数],
        '总数': len(过滤后),
        '页码': 页码,
        '每页条数': 每页条数,
    }


def 删除商品(参数, 查询, 体):
    商品列表 = 数据库['商品列表']
    for 索引, 商品 in enumerate(商品列表):
        if 商品['id'] == 参数['id']:
            商品列表.pop(索引)
            return {'id': 参数['id']}
    raise ValueError('商品不存在')


def 切换商品收藏(参数, 查询, 体):
    for 商品 in 数据库['商品列表']:
        if 商品['id'] == 参数['id']:
            商品['收藏'] = 取布尔((体 or {}).get('收藏'))
            return {'id': 商品['id'], '收藏': 商品['收藏']}
    raise ValueError('商品不存在')


# ===================== 黑名单 / 清空缓存 =====================

def 加入黑名单通用(商品: dict) -> None:
    """商品加入黑名单（去重）"""
    if not any(b['商品ID'] == 商品['id'] for b in 数据库['黑名单列表']):
        数据库['黑名单列表'].insert(0, {
            'id': 商品['id'],
            '商品ID': 商品['id'],
            '标题': 商品['标题'],
            '价格': 商品['价格'],
            '图片': 商品['图片'],
            '所属关键词': 商品['所属关键词'],
            '加入时间': 格式化时间(datetime.now()),
        })


def 获取黑名单(参数, 查询, 体):
    return 数据库['黑名单列表']


def 商品加入黑名单(参数, 查询, 体):
    商品列表 = 数据库['商品列表']
    for 索引, 商品 in enumerate(商品列表):
        if 商品['id'] == 参数['id']:
            商品列表.pop(索引)
            加入黑名单通用(商品)
            return {'id': 商品['id']}
    raise ValueError('商品不存在')


def 黑名单还原(参数, 查询, 体):
    黑名单 = 数据库['黑名单列表']
    for 索引, 记录 in enumerate(黑名单):
        if 记录['id'] == 参数['id']:
            被还原 = 黑名单.pop(索引)
            return {'id': 被还原['商品ID']}
    raise ValueError('黑名单记录不存在')


def 清空商品数据(参数, 查询, 体):
    清空数量 = len(数据库['商品列表'])
    数据库['商品列表'] = []
    return {'清空数量': 清空数量}


# ===================== 待处理审核 =====================

def 获取待处理(参数, 查询, 体):
    return 数据库['待处理列表']


def 待处理收录(参数, 查询, 体):
    待处理 = 数据库['待处理列表']
    for 索引, 商品 in enumerate(待处理):
        if 商品['id'] == 参数['id']:
            待处理.pop(索引)
            if not any(g['id'] == 商品['id'] for g in 数据库['商品列表']):
                数据库['商品列表'].insert(0, 商品)
            return {'id': 商品['id']}
    raise ValueError('待处理商品不存在')


def 待处理拉黑(参数, 查询, 体):
    待处理 = 数据库['待处理列表']
    for 索引, 商品 in enumerate(待处理):
        if 商品['id'] == 参数['id']:
            待处理.pop(索引)
            加入黑名单通用(商品)
            return {'id': 商品['id']}
    raise ValueError('待处理商品不存在')


def 清空黑名单(参数, 查询, 体):
    清空数量 = len(数据库['黑名单列表'])
    数据库['黑名单列表'] = []
    return {'清空数量': 清空数量}


# ===================== 爬取任务调度 =====================

def 构建调度状态():
    运行中 = 数据库['调度运行中']
    return {
        '运行中': 运行中,
        '任务总数': len(数据库['任务列表']),
        '启用任务数': len([t for t in 数据库['任务列表'] if t['启用']]),
        '间隔秒数': 数据库['间隔秒数'],
        '最大重试次数': 数据库['最大重试次数'],
        '上次执行时间': 数据库['上次执行时间'],
        '下次执行时间': 偏移时间(数据库['间隔秒数'] / 3600) if 运行中 else None,
    }


def 调度状态(参数, 查询, 体):
    return 构建调度状态()


def 启动调度(参数, 查询, 体):
    数据库['调度运行中'] = True
    return 构建调度状态()


def 停止调度(参数, 查询, 体):
    数据库['调度运行中'] = False
    return 构建调度状态()


def 更新调度配置(参数, 查询, 体):
    体 = 体 or {}
    if 体.get('间隔秒数') is not None:
        数据库['间隔秒数'] = 体['间隔秒数']
    if 体.get('最大重试次数') is not None:
        数据库['最大重试次数'] = 体['最大重试次数']
    return 构建调度状态()


def 获取执行记录(参数, 查询, 体):
    return 数据库['执行记录']


def 立即执行任务(参数, 查询, 体):
    for 任务 in 数据库['任务列表']:
        if 任务['id'] == 参数['taskId']:
            起始时刻 = time.monotonic()
            结果 = 执行真实搜索(任务)
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
            数据库['执行记录'].insert(0, 新记录)
            数据库['上次执行时间'] = 新记录['开始时间']
            return 新记录
    raise ValueError('任务不存在')


# ===================== 推送设置与记录 =====================

def 获取推送配置(参数, 查询, 体):
    return 数据库['推送配置']


def 更新推送配置(参数, 查询, 体):
    数据库['推送配置'] = {**数据库['推送配置'], **(体 or {})}
    return 数据库['推送配置']


def 获取推送记录(参数, 查询, 体):
    return 数据库['推送记录']


# ===================== 系统设置 =====================

def 获取系统配置(参数, 查询, 体):
    return 数据库['系统配置']


def 更新系统配置(参数, 查询, 体):
    数据库['系统配置'] = {**数据库['系统配置'], **(体 or {})}
    return 数据库['系统配置']


def 刷新令牌(参数, 查询, 体):
    数据库['系统配置']['令牌状态'] = '正常'
    return 数据库['系统配置']


# ===================== 路由注册（顺序即匹配优先级：静态路径先于参数路径） =====================

注册路由('GET', '/dashboard/stats', 看板统计)

注册路由('GET', '/tasks', 任务列表查询)
注册路由('POST', '/tasks', 新建任务)
注册路由('PUT', '/tasks/:id', 更新任务)
注册路由('DELETE', '/tasks/:id', 删除任务)
注册路由('PATCH', '/tasks/:id/status', 切换任务状态)
注册路由('POST', '/tasks/:id/run', 试跑任务)

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
注册路由('POST', '/goods/blacklist/clear', 清空黑名单)

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
# 新结构：{商品列表, 黑名单列表, 待处理列表, 历史价格}
# - 历史价格（itemId -> 价格）沿用旧爬虫 good_record.json 的平铺结构语义，供真实爬虫做降价去重
# - 兼容迁移：读到旧平铺结构时，把旧记录整体挪入 历史价格，商品数据回退种子

存储路径 = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'good_record.json')


def 加载数据库() -> None:
    """启动时从 good_record.json 加载商品数据；文件缺失或损坏则用种子并落盘"""
    if os.path.exists(存储路径):
        try:
            with open(存储路径, 'r', encoding='utf-8') as 文件:
                磁盘数据 = json.load(文件)
            if isinstance(磁盘数据, dict) and '商品列表' in 磁盘数据:
                # 新结构：直接覆盖内存种子
                数据库['商品列表'] = 磁盘数据.get('商品列表', [])
                数据库['黑名单列表'] = 磁盘数据.get('黑名单列表', [])
                数据库['待处理列表'] = 磁盘数据.get('待处理列表', [])
                数据库['历史价格'] = 磁盘数据.get('历史价格', {})
                return
            if isinstance(磁盘数据, dict):
                # 旧爬虫平铺结构（itemId -> 价格）：迁移保留，商品数据保持种子
                数据库['历史价格'] = 磁盘数据
        except (json.JSONDecodeError, OSError):
            pass  # 文件损坏则回退种子
    保存数据库()


def 保存数据库() -> None:
    """把商品相关数据写回 good_record.json（每次非查询写操作后自动调用）"""
    落盘数据 = {
        '商品列表': 数据库['商品列表'],
        '黑名单列表': 数据库['黑名单列表'],
        '待处理列表': 数据库['待处理列表'],
        '历史价格': 数据库['历史价格'],
    }
    with open(存储路径, 'w', encoding='utf-8') as 文件:
        json.dump(落盘数据, 文件, ensure_ascii=False, indent=4)


# ===================== HTTP 服务 =====================

def 分发请求(方法: str, 路径: str, 查询: dict, 体):
    """按注册顺序匹配路由并调用处理器；处理器在锁内执行保证线程安全"""
    for 路由方法, 正则, 处理器 in 路由表:
        if 路由方法 != 方法:
            continue
        匹配 = 正则.match(路径)
        if 匹配:
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

    def _处理请求(self, 方法: str) -> None:
        解析结果 = urlparse(self.path)
        路径 = 解析结果.path
        # query 参数单值化（parse_qs 默认丢弃空值参数，与前端约定一致）
        查询 = {键: 值列表[0] for 键, 值列表 in parse_qs(解析结果.query).items()}

        体 = None
        内容长度 = int(self.headers.get('Content-Length') or 0)
        if 内容长度 > 0:
            原始内容 = self.rfile.read(内容长度).decode('utf-8')
            if 原始内容:
                try:
                    体 = json.loads(原始内容)
                except json.JSONDecodeError:
                    体 = None

        try:
            结果 = 分发请求(方法, 路径, 查询, 体)
            self._写响应({'code': 0, 'message': 'ok', 'data': 结果})
        except LookupError as 错误:
            self._写响应({'code': 1, 'message': str(错误), 'data': None}, 404)
        except Exception as 错误:  # 业务异常统一转为 code=1，HTTP 状态保持 200
            self._写响应({'code': 1, 'message': str(错误), 'data': None})

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
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def log_message(self, 格式, *参数) -> None:
        print(f'[{格式化时间(datetime.now())}] {格式 % 参数}')


if __name__ == '__main__':
    加载数据库()  # 优先加载 good_record.json（含旧结构自动迁移），否则用种子并落盘
    spider.初始化爬虫()  # 加载 option.yaml 配置并强制关闭推送（用户未配置微信）
    服务 = ThreadingHTTPServer(('127.0.0.1', 端口), 接口处理器)
    print(f'闲鱼蹲物后台 API 已启动: http://127.0.0.1:{端口}')
    print(f'商品数据持久化: {存储路径}（写操作实时落盘）')
    try:
        服务.serve_forever()
    except KeyboardInterrupt:
        print('\n服务已停止')
        服务.server_close()
