import random
import string
from datetime import datetime, timedelta


def generate_random_str(length, digits=False, uppercase=False, lowercase=False):
    all_characters = ''
    if digits:
        all_characters += string.digits
    if lowercase:
        all_characters += string.ascii_lowercase
    if uppercase:
        all_characters += string.ascii_uppercase
    # 从所有可能字符中随机选择指定长度的字符
    if all_characters == '':
        all_characters += string.ascii_letters + string.digits
    random_string = "".join(random.choice(all_characters) for _ in range(length))
    return random_string


def 格式化时间(日期: datetime) -> str:
    """将日期格式化为 YYYY-MM-DD HH:mm:ss"""
    return 日期.strftime('%Y-%m-%d %H:%M:%S')


def 偏移时间(小时: float) -> str:
    """相对当前时间偏移指定小时（可为小数、负数），返回格式化字符串"""
    return 格式化时间(datetime.now() + timedelta(hours=小时))
