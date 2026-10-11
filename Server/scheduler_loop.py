#  循环调度模块：后台常驻线程，按间隔自动执行 goods_tasks.yaml 中启用的全部任务
#  前端页面关闭也照常运行；提供线程单例的启动/停止/状态查询，供调度页按钮真实控制
#
#  依赖方向：本模块 -> api_server（执行管线），api_server 不再反向导入本模块，避免循环导入

import random
import threading

import api_server
import config_manager
import task_store

# 循环线程单例与控制事件
循环线程 = None
停止事件 = threading.Event()
配置变更事件 = threading.Event()  # 设置页修改间隔/重试次数后 set，标记需要按新间隔重新计时
任务变更事件 = threading.Event()  # UI 启用/停用任务后 set：等待中立即开始新一轮，任务间跳过停顿
打断事件 = threading.Event()     # 停止/配置变更/任务开关任一发生即置位，立即唤醒长等待
中断任务ID集合 = set()            # 停用正在爬取的任务时置入其ID，爬取回调检测到即中断翻页
当前执行任务ID = None             # 循环线程正在执行的任务ID（停用时判断是否需要打断爬取）
单例锁 = threading.Lock()


def 通知配置变更() -> None:
    """供 api_server 在更新调度配置后调用，打断循环线程的当前等待"""
    配置变更事件.set()
    打断事件.set()
    print('配置变更通知已发送')


def 通知任务开关变更(任务ID: str, 新启用: bool) -> None:
    """供 api_server 在 UI 切换任务启用状态后调用，让开关即时生效

    停用：该任务若正在爬取则立即打断（中断任务ID集合）；启用：唤醒轮间等待，立即开始执行
    """
    global 当前执行任务ID
    任务变更事件.set()
    打断事件.set()
    if not 新启用 and 当前执行任务ID == 任务ID:
        中断任务ID集合.add(任务ID)
        print(f'任务 {任务ID} 已停用：打断正在进行的爬取')
    elif 新启用:
        print(f'任务 {任务ID} 已启用：调度循环将立即执行')


class 循环调度线程类(threading.Thread):
    """循环线程：每轮依次执行启用任务，完成后等待配置间隔（可被停止打断）"""

    def __init__(self):
        super().__init__(name='循环调度线程', daemon=True)

    def run(self) -> None:
        global 当前执行任务ID
        print('循环调度线程已启动：开始自动执行启用的查询任务')
        while not 停止事件.is_set():
            api_server.开始收集本轮()  # 清空收集器：本轮所有任务的上新/降价统一攒到轮末汇总
            已执行ID: set = set()
            # 内层循环每执行完一个任务都重读启用快照：UI 刚启用的任务立刻插队执行，
            # 刚停用的任务立刻剔除（含打断其进行中的爬取），无需等本轮跑完
            while not 停止事件.is_set():
                启用任务 = [t for t in task_store.读取全部() if t['启用'] and t['id'] not in 已执行ID]
                if not 启用任务:
                    break
                任务 = 启用任务[0]
                任务ID = 任务['id']
                当前执行任务ID = 任务ID
                中断任务ID集合.discard(任务ID)  # 清掉可能残留的中断标记
                try:
                    # 执行管线内部已自行管理锁：网络爬取在锁外、仅数据处理持锁，避免爬取期间 HTTP API 全阻塞
                    # 中断检查回调：停止调度或该任务被 UI 停用时，spider 在下一页开爬前立即中断
                    新记录 = api_server.执行任务并记录(
                        任务,
                        中断检查=lambda tid=任务ID: 停止事件.is_set() or tid in 中断任务ID集合,
                    )
                    api_server.保存数据库()
                    print(
                        f"自动执行「{任务['关键词']}」{新记录['状态']}："
                        f"命中 {新记录['结果数']}，新增 {新记录['新商品数']}，{新记录['信息']}"
                    )
                except Exception as e:
                    print(f"自动执行「{任务['关键词']}」异常: {e}")
                当前执行任务ID = None
                中断任务ID集合.discard(任务ID)
                已执行ID.add(任务ID)
                if 停止事件.is_set():
                    break
                if 任务变更事件.is_set():
                    continue  # 开关有变：跳过任务间停顿，立即重读快照执行新启用的任务
                # 任务之间随机停顿，避免连续请求触发反爬
                if 停止事件.wait(random.uniform(3, 5)):
                    break  # 停顿期间被停止则直接退出本轮
            # 本轮所有任务执行完：设备统一只发 1 条汇总通知，微信开启则逐条全部推送
            api_server.结束收集并推送()
            # 等待下一轮：间隔在配置基础上 0%~-25% 随机浮动，避免固定周期被反爬识别
            # 顺序必须是 先清唤醒信号 → 核对停止标志 → 再等待：防止信号在清空与检查之间丢失
            # 导致睡满整个旧间隔；停止/配置变更/任务开关都会置位打断事件，wait 一次性返回
            打断事件.clear()
            配置变更事件.clear()
            任务变更事件.clear()
            if 停止事件.is_set():
                break
            间隔秒数 = int(config_manager.option.get('repeat_sleep', 1800)) if config_manager.option else 1800
            打断事件.wait(间隔秒数 * random.uniform(0.75, 1))
            if 停止事件.is_set():
                break
            if 任务变更事件.is_set():
                print('检测到任务开关变更，立即开始新一轮')
                任务变更事件.clear()
                continue  # UI 启用了任务：不等间隔，马上执行
            if 配置变更事件.is_set():
                print('检测到配置变更，以新间隔重新计时')
                配置变更事件.clear()
        print('循环调度线程已停止')


def 启动循环() -> bool:
    """启动循环线程单例；已在运行则忽略，返回是否处于运行状态"""
    global 循环线程, 停止事件, 打断事件, 任务变更事件
    with 单例锁:
        if 循环线程 is not None and 循环线程.is_alive():
            return True
        停止事件 = threading.Event()
        打断事件 = threading.Event()  # 同步重置，避免上次停止残留的唤醒信号导致新线程空转
        任务变更事件 = threading.Event()
        中断任务ID集合.clear()
        循环线程 = 循环调度线程类()
        循环线程.start()
        return True


def 停止循环() -> bool:
    """通知循环线程停止并等待退出，返回 False 表示已停"""
    global 循环线程
    with 单例锁:
        if 循环线程 is None or not 循环线程.is_alive():
            return False
        停止事件.set()
        打断事件.set()  # 唤醒可能正在长等待的线程，让停止立即生效
        循环线程.join(timeout=10)
        循环线程 = None
        return False


def 循环是否运行() -> bool:
    """查询循环线程当前是否存活"""
    return 循环线程 is not None and 循环线程.is_alive()
