
import threading
from plyer import notification
import time

def send_good_msg(itemId,title,soldPrice,area,picUrl,itemUrl):
    msg=f'商品ID：{itemId}\n商品标题：{title}\n商品价格：{soldPrice}\n商品地区：{area}\n商品图片：{picUrl}\n商品链接：{itemUrl}'
    notification.notify(
        title='咸鱼',
        message=msg,
        app_name='咸鱼',
        timeout=0,  # 通知显示时间（秒）
        ticker='简短提示',
    )
    pass
def send_good(itemId,title,soldPrice,area,picUrl,itemUrl):
    res = send_good_msg(itemId,title,soldPrice,area,picUrl,itemUrl)
    time.sleep(1)# 发送延迟
    return res

print(send_good('123','title','price','area','picUrl','itemUrl'))