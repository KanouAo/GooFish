import random
import string

def generate_random_str(length, digits=False,uppercase=False, lowercase=False):
    all_characters=''
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
