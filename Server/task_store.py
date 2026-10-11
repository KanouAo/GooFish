#  任务存储模块：商品查询任务列表的唯一数据源（goods_tasks.json）
#  后台界面增删改与后台循环爬取都通过本模块访问任务，任务在内存缓存并实时落盘 JSON
#  兼容：首次运行若存在旧 goods_tasks.yaml，会自动迁移为 JSON 并移除旧文件

import copy
import json
import os
import threading
from datetime import datetime

import fake_data
from utils import 格式化时间

# goods_tasks.json 与本文件同目录
任务文件路径 = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'goods_tasks.json')
# 旧版 YAML 文件路径（仅用于一次性迁移）
旧任务文件路径 = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'goods_tasks.yaml')

# 内存中的任务列表缓存（元素为普通 dict，结构与前端任务一致）
任务列表: list[dict] = []

# 任务读写锁：HTTP 请求线程与循环调度线程可能同时访问
任务锁 = threading.Lock()

def 加载任务() -> None:
    """启动时按优先级加载：goods_tasks.json > 迁移旧 goods_tasks.yaml > 种子初始化"""
    global 任务列表
    with 任务锁:
        if os.path.exists(任务文件路径):
            try:
                with open(任务文件路径, 'r', encoding='utf-8') as 文件:
                    磁盘任务 = json.load(文件)
                if isinstance(磁盘任务, list):
                    任务列表 = 磁盘任务
                    return
            except (json.JSONDecodeError, OSError):
                pass
        # 都没有或损坏：深拷贝种子，避免后续修改污染 fake_data
        任务列表 = copy.deepcopy(fake_data.初始任务列表)
        保存任务()


def 保存任务() -> None:
    """把内存任务列表写回 goods_tasks.json（UTF-8、缩进 4、中文不转义）"""
    with open(任务文件路径, 'w', encoding='utf-8') as 文件:
        json.dump(任务列表, 文件, ensure_ascii=False, indent=4)


def 读取全部() -> list[dict]:
    """返回全部任务（内存缓存列表本身，调用方只读使用）"""
    return 任务列表


def 根据ID取(任务ID: str):
    """按任务 id 查找，找不到返回 None"""
    for 任务 in 任务列表:
        if 任务['id'] == 任务ID:
            return 任务
    return None


def 查询任务(关键词: str = '', 启用状态文本: str = '') -> list[dict]:
    """按关键词（匹配关键词或备注）与启用状态筛选任务"""
    有状态过滤 = 启用状态文本 != ''
    结果 = []
    for 任务 in 任务列表:
        if 关键词 and 关键词 not in 任务['关键词'] and 关键词 not in 任务.get('备注', ''):
            continue
        if 有状态过滤 and bool(任务['启用']) != (启用状态文本 == 'true'):
            continue
        结果.append(任务)
    return 结果


def 新增任务(表单: dict) -> dict:
    """新增任务：分配下一个 id、写入创建时间，落盘后返回新任务"""
    最大编号 = max((int(t['id']) for t in 任务列表), default=0)
    # 页数默认 50；缺失/非法时兜底，并钳制在 1~50（硬上限，实际翻页还会受 hasNextPage 限制）
    原始页数 = 表单.get('页数')
    if not isinstance(原始页数, int) or 原始页数 < 1:
        页数 = 50
    else:
        页数 = min(原始页数, 50)
    新任务 = {**表单, '页数': 页数, 'id': str(最大编号 + 1), '创建时间': 格式化时间(datetime.now())}
    任务列表.append(新任务)
    保存任务()
    return 新任务


def 更新任务(任务ID: str, 表单: dict) -> dict:
    """更新任务：合并表单字段（id 不可改），落盘后返回新任务"""
    for 索引, 任务 in enumerate(任务列表):
        if 任务['id'] == 任务ID:
            新任务 = {**任务, **表单, 'id': 任务ID}
            任务列表[索引] = 新任务
            保存任务()
            return 新任务
    raise ValueError('任务不存在')


def 删除任务(任务ID: str) -> dict:
    """删除任务并落盘，返回被删除的任务（同步清空商品由调用方处理）"""
    for 索引, 任务 in enumerate(任务列表):
        if 任务['id'] == 任务ID:
            被删任务 = 任务列表.pop(索引)
            保存任务()
            return 被删任务
    raise ValueError('任务不存在')


def 切换任务启用(任务ID: str, 启用: bool) -> dict:
    """切换任务启用状态并落盘"""
    任务 = 根据ID取(任务ID)
    if 任务 is None:
        raise ValueError('任务不存在')
    任务['启用'] = 启用
    保存任务()
    return {'id': 任务ID, '启用': 启用}
