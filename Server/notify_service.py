# -*- coding: utf-8 -*-
"""Windows toast 系统通知服务：通过 PowerShell 调用 WinRT ToastNotificationManager

- 零依赖（仅用系统自带 PowerShell + WinRT）
- 通知出现在操作中心，不抢焦点、不最小化全屏应用
- 点击通知以 protocol 激活打开默认浏览器进入管理面板
- 无论前端页面是否在线都由 api_server 在轮次结束时调用（本地推送开关控制）
"""

import os
import subprocess


def _后台地址() -> str:
    """管理面板访问地址（toast 点击跳转用）：从配置读端口，读不到用默认 51266"""
    try:
        import config_manager
        端口 = int((config_manager.option or {}).get('server_port', 51266))
    except Exception:
        端口 = 51266
    return f'http://127.0.0.1:{端口}/'


def _发送toast(标题: str, 内容: str) -> bool:
    """底层：发送 1 条 Windows toast 到操作中心（低干扰，不抢焦点），返回是否成功

    点击通知以 protocol 激活打开默认浏览器并进入管理面板
    """
    #  通过环境变量传参避免 PowerShell 字符串转义问题
    #  注意：GetElementsByTagName 返回动态集合，必须先存变量再用 .Item(i) 取节点——
    #  直接 GetElementsByTagName("text")[0]/[1] 连续访问会在第二次触发
    #  「Collection was modified」异常导致正文丢失、通知弹不出
    ps_script = (
        '[Windows.UI.Notifications.ToastNotificationManager, '
        'Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null;'
        '$t = [Windows.UI.Notifications.ToastNotificationManager]'
        '::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]'
        '::ToastText02);'
        #  点击通知打开浏览器管理面板：toast 根元素设 protocol 激活 + 目标 URL
        '$t.DocumentElement.SetAttribute("activationType", "protocol");'
        '$t.DocumentElement.SetAttribute("launch", $env:NOTIFY_LAUNCH);'
        '$n = $t.GetElementsByTagName("text");'
        '$n.Item(0).AppendChild($t.CreateTextNode($env:NOTIFY_TITLE)) | Out-Null;'
        '$n.Item(1).AppendChild($t.CreateTextNode($env:NOTIFY_BODY)) | Out-Null;'
        '$toast = [Windows.UI.Notifications.ToastNotification]::new($t);'
        '[Windows.UI.Notifications.ToastNotificationManager]'
        '::CreateToastNotifier("GooFish").Show($toast)'
    )

    环境变量 = {**os.environ, 'NOTIFY_TITLE': 标题, 'NOTIFY_BODY': 内容, 'NOTIFY_LAUNCH': _后台地址()}
    try:
        结果 = subprocess.run(
            ['powershell', '-NoProfile', '-Command', ps_script],
            capture_output=True,
            timeout=10,
            env=环境变量,
        )
        # stderr 非空说明 WinRT 调用出错（弹不出来），打印出来便于排查，不再静默吞掉
        错误输出 = 结果.stderr.decode('gbk', errors='replace').strip()
        if 错误输出 or 结果.returncode != 0:
            print(f'[设备通知] toast 发送异常(returncode={结果.returncode}): {错误输出[:200]}')
            return False
        return True
    except Exception as e:
        print(f'[设备通知] toast 发送失败: {e}')
        return False  # 通知失败不影响主流程


def 发送系统通知(类型: str, 数据: dict) -> None:
    """发送单条 Windows toast 通知到操作中心（保留兼容；当前主流程改用 发送汇总通知）"""
    if 类型 == '上新':
        标题 = '新商品上架提醒'
        内容 = f"{数据.get('标题', '未知商品')} ¥{数据.get('价格', '?')}"
    elif 类型 == '降价':
        标题 = '商品降价提醒'
        当前 = 数据.get('当前价格', '?')
        上次 = 数据.get('上次价格', '?')
        降价幅度 = 数据.get('降价幅度', 0)
        内容 = f"{数据.get('标题', '未知商品')} ¥{上次}→¥{当前} 降了¥{降价幅度}"
    else:
        标题 = '闲鱼蹲物提醒'
        内容 = str(数据.get('标题', ''))
    _发送toast(标题, 内容)


def 发送汇总通知(汇总: dict) -> bool:
    """一轮任务结束后发 1 条汇总 toast：统一告知本轮上新数/降价数，不再逐商品刷屏

    汇总: {'上新数': int, '降价数': int, '上新预览': [str], '降价预览': [str]}
    返回 toast 是否发送成功（供推送历史如实记录）
    """
    上新数 = 汇总.get('上新数', 0)
    降价数 = 汇总.get('降价数', 0)
    标题 = '闲鱼蹲物：本轮有新动态'
    内容 = f'新商品 {上新数} 件，降价 {降价数} 件'
    预览 = list(汇总.get('上新预览', [])[:2]) + list(汇总.get('降价预览', [])[:2])
    if 预览:
        内容 += '：' + '；'.join(预览)
    return _发送toast(标题, 内容)
