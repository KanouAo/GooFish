#  配置管理模块：负责 option.yaml（test_option.yaml 优先）与 JSON 文件的读写、cookies 随机化
#  其他模块统一通过「config_manager.option」访问当前配置，避免 from import 导致配置重载后拿到旧引用

import json
import os
import time

from ruamel.yaml import YAML

import utils

yaml = YAML(typ='rt')

# 当前配置对象：初始为 None，调用 读取配置() 后填充
option = None

# 模块所在目录：把路径锚定到脚本自身位置，保证从任意工作目录启动都能找到配置文件
模块目录 = os.path.dirname(os.path.abspath(__file__))

# 配置文件路径：存在测试配置时优先生效（开发联调用）
测试配置路径 = os.path.join(模块目录, 'test_option.yaml')
正式配置路径 = os.path.join(模块目录, 'option.yaml')
配置路径 = 测试配置路径 if os.path.exists(测试配置路径) else 正式配置路径
商品记录路径 = os.path.join(模块目录, 'good_record.json')


def 读取配置() -> dict:
    """从配置文件加载配置到全局 option 并返回"""
    global option
    with open(配置路径, 'r', encoding='utf-8') as stream:
        option = yaml.load(stream)
    return option


def 写回配置() -> None:
    """把当前 option 写回配置文件（令牌续期等场景调用）"""
    with open(配置路径, 'w', encoding='utf-8') as outfile:
        yaml.dump(option, outfile)


def 读取JSON(文件路径: str):
    """读取 JSON 文件并返回解析结果"""
    with open(文件路径, 'r', encoding='utf-8') as file:
        return json.load(file)


def 写入JSON(数据, 文件路径: str) -> None:
    """以 UTF-8、缩进 4 写入 JSON 文件"""
    with open(文件路径, 'w', encoding='utf-8') as file:
        json.dump(数据, file, ensure_ascii=False, indent=4)


def 随机化配置() -> None:
    """按 option['random_option'] 开关随机化隐私 cookies（机器编号等）
    注意：_m_h5_tk / _m_h5_tk_enc 是令牌，如果开启随机化，首次启动会覆盖已续期的真实令牌，导致每次重启都以「非法令牌」重来。
    """
    option['cookies']['cna'] = utils.generate_random_str(24)
    option['cookies']['t'] = utils.generate_random_str(32, digits=True, lowercase=True)
    option['cookies']['_tb_token_'] = utils.generate_random_str(16, digits=True, lowercase=True)
    option['cookies']['cookie2'] = utils.generate_random_str(32, digits=True, lowercase=True)
    option['cookies']['_m_h5_tk'] = (
        utils.generate_random_str(32, digits=True, lowercase=True)
        + '_' + str(int(round(time.time() * 1000)))
    )
    option['cookies']['_m_h5_tk_enc'] = utils.generate_random_str(32, digits=True, lowercase=True)
