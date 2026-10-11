#  代理池模块：检测配置中代理 IP 的可用性，返回可用代理列表。
# 这是保留功能，我实际不怎么用，无法保证稳定性

import requests

import config_manager as 配置


def 检测代理(代理地址: str) -> bool:
    """检测单个代理是否可以使用（以能否访问百度为准）"""
    代理 = {
        'http': 'http://' + 代理地址,
        'https': 'http://' + 代理地址,
    }
    try:
        # 不设 timeout：让响应自然等待，部分免费代理慢但能用
        response = requests.get(
            url='http://www.baidu.com',
            headers=配置.option['headers'],
            proxies=代理,
        )
        response.close()
        return response.status_code == 200
    except Exception as e:
        print(e)
        return False


def 获取代理列表() -> list:
    """遍历配置里的代理池，返回检测可用的代理列表"""
    可用代理 = []
    for 代理地址 in 配置.option['proxies']:
        if 检测代理(代理地址):
            可用代理.append({'http': 代理地址, 'https': 代理地址})
    if len(可用代理) == 0:
        print('配置文件里没有可用的代理')
    return 可用代理
