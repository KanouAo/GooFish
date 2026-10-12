#  总入口模块：一条命令完成全部启动编排
#  1. 加载 good_record.json（商品/黑名单/新商品/降价列表）
#  2. 加载 option.yaml（请求头/cookies/签名），按需随机化并强制关闭推送
#  3. 加载 goods_tasks.json（商品查询任务列表，旧 yaml 自动迁移）
#  4. 拉起后台循环调度线程（自动执行启用任务，前端关闭也照跑）
#  5. 主线程启动 HTTP API 服务并阻塞

import os
import sys

#  把本模块所在目录插入 sys.path：官方 embeddable Python 的 ._pth 模式不会自动把脚本目录
#  加入模块搜索路径，打包产物中 main.py 与其余模块同目录，不注入则 import api_server 直接失败
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import api_server
import scheduler_loop
import spider
import task_store


def 启动() -> None:
    """按顺序初始化各子系统，最后阻塞运行 HTTP 服务"""
    api_server.加载数据库()   # 商品数据
    spider.初始化爬虫()       # 请求配置
    task_store.加载任务()     # 查询任务列表
    # 先 bind 端口：被占用（重复启动）时立即失败退出，此刻循环线程尚未启动，干净利落不留爬取
    try:
        服务 = api_server.创建并绑定服务()
    except OSError as e:
        print(f'HTTP 端口绑定失败（端口已被占用，说明后台已在运行，请勿重复启动）: {e}')
        return
    # bind 成功后再拉起循环线程，随后主线程阻塞对外服务
    scheduler_loop.启动循环()
    api_server.运行服务(服务)


if __name__ == '__main__':
    启动()
