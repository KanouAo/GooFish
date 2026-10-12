#  商品记录管理模块：good_record.json 的唯一读写入口
import json
import os
import threading
from config_manager import 商品记录路径

记录锁 = threading.Lock()

商品列表 = []
黑名单列表 = []
新商品列表 = []
降价列表 = []
历史价格 = {}

def 加载():
    """从 good_record.json 加载到内存"""
    global 商品列表, 黑名单列表, 新商品列表, 降价列表, 历史价格
    with 记录锁:
        if os.path.exists(商品记录路径):
            with open(商品记录路径, 'r', encoding='utf-8') as f:
                数据 = json.load(f)
                商品列表 = 数据.get('商品列表', [])
                黑名单列表 = 数据.get('黑名单列表', [])
                新商品列表 = 数据.get('新商品列表', [])
                降价列表 = 数据.get('降价列表', [])
                历史价格 = 数据.get('历史价格', {})

def 保存():
    """保存到 good_record.json"""
    with 记录锁:
        数据 = {
            '商品列表': 商品列表,
            '黑名单列表': 黑名单列表,
            '新商品列表': 新商品列表,
            '降价列表': 降价列表,
            '历史价格': 历史价格,
        }
        with open(商品记录路径, 'w', encoding='utf-8') as f:
            json.dump(数据, f, ensure_ascii=False, indent=4)
