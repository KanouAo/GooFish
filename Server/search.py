#  搜索客户端模块：物品信息类 —— 咸鱼搜索接口的报文构建、签名、请求、令牌续期，
#  以及旧版循环爬虫使用的「生成商品并推送」流程。逻辑与原 main.py 保持等价。
import hashlib
import json
import random
import time
import requests
import config_manager as 配置
from goods_model import 商品类
from proxy_pool import 获取代理列表
from wechat_service import send_good as 微信推送商品, 微信推送是否开启
class 物品信息类:
    """单个搜索任务对应的搜索客户端实例"""
    headers = {}
    cookies = {}
    params = {}
    data = {}  # 搜索用的合并后的 data
    search_data = {}  # 配置文件里未合并的散乱搜索用 data
    proxies = {}
    proxies_pool = []
    black_proxies_pool = []
    url = 'https://h5api.m.goofish.com/h5/mtop.taobao.idlemtopsearch.pc.search/1.0/'
    res = {}
    结果列表 = []
    有下一页 = False
    good_list = []  # 用于推送的商品列表
    def __init__(self, search_data):
        if 配置.option['use_proxy']:
            self.proxies_pool = 获取代理列表()
            if self.proxies_pool:
                self.proxies = random.choice(self.proxies_pool)
        self.headers = 配置.option['headers']
        self.cookies = 配置.option['cookies']
        self.params = 配置.option['params']
        self.search_data = search_data
        self.构建搜索报文()
    def 续期令牌(self) -> bool:
        """制作令牌：从响应中取真实令牌写回内存与配置文件

        返回 False 表示本次响应没下发新令牌（偶发），调用方仍按「非法/过期」返回，
        由上层重试本页时再次触发续期，避免因 KeyError 直接中断整轮翻页导致结果缺失
        """
        new_cookies = requests.utils.dict_from_cookiejar(self.res.cookies)
        if '_m_h5_tk' not in new_cookies or '_m_h5_tk_enc' not in new_cookies:
            print('本次响应未下发新令牌，暂不更新，将在下次请求时继续续期')
            return False
        self.cookies['_m_h5_tk'] = new_cookies['_m_h5_tk']
        self.cookies['_m_h5_tk_enc'] = new_cookies['_m_h5_tk_enc']
        配置.写回配置()
        return True
    def 构建搜索报文(self):
        """制作搜索用的数据（与原 make_search_data 逻辑一致）"""
        pageNumber = self.search_data['pageNumber']
        keyword = self.search_data['keyword']
        fromFilter = self.search_data['fromFilter']
        rowsPerPage = self.search_data['rowsPerPage']
        sortValue = self.search_data['sortValue']
        sortField = self.search_data['sortField']
        customDistance = self.search_data['customDistance']
        gps = self.search_data['gps']
        propValueStr = '{}'
        过滤串 = ""
        publishDays = self.search_data['propValueStr']['searchFilter']['publishDays']
        priceRange = self.search_data['propValueStr']['searchFilter']['priceRange']
        quickFilter = self.search_data['propValueStr']['searchFilter']['quickFilter']
        if publishDays and sortField != "create":  # sortField 是新发布时不添加发布日期过滤
            过滤串 = 过滤串 + "publishDays:" + publishDays + ";"
        if priceRange:
            过滤串 = 过滤串 + "priceRange:" + priceRange + ";"
        if quickFilter:
            过滤串 = 过滤串 + "quickFilter:" + quickFilter + ";"
        if 过滤串:
            propValueStr = '{"searchFilter":"' + 过滤串 + '"}'
        customGps = self.search_data['customGps']
        searchReqFromPage = self.search_data['searchReqFromPage']
        extraFilterValue = self.search_data['extraFilterValue']
        userPositionJson = self.search_data['userPositionJson']
        data = f'{{"pageNumber":{pageNumber},"keyword":"{keyword}","fromFilter":{fromFilter},"rowsPerPage":30,"sortValue":"","sortField":"","customDistance":"","gps":"","propValueStr":{propValueStr},"customGps":"","searchReqFromPage":"pcSearch","extraFilterValue":"{extraFilterValue}","userPositionJson":"{userPositionJson}"}}'
        self.data['data'] = data
    def 请求一页搜索结果(self):
        """请求一次搜索接口：生成时间戳与签名、发请求、按 ret 状态分支处理，返回结果信息"""
        # 时间戳
        t_now = str(int(round(time.time() * 1000)))
        self.params['t'] = str(t_now)
        # 签名
        sign_data = (
            self.cookies['_m_h5_tk'].split('_')[0]
            + "&" + t_now
            + "&" + self.params['appKey']
            + "&" + self.data["data"]
        )
        self.params['sign'] = hashlib.md5(sign_data.encode(encoding='UTF-8')).hexdigest()
        # 构建链接
        try:
            if 配置.option['use_proxy'] and self.proxies:
                self.res = requests.post(
                    self.url,
                    headers=self.headers,
                    cookies=self.cookies,
                    params=self.params,
                    data=self.data,
                    proxies=self.proxies,
                )
            else:
                self.res = requests.post(
                    self.url,
                    headers=self.headers,
                    cookies=self.cookies,
                    params=self.params,
                    data=self.data,
                )
            self.res.close()
        except Exception as e:
            if '由于目标计算机积极拒绝' in str(e):
                self.proxies_pool = 获取代理列表()
                if self.proxies_pool:
                    self.proxies = random.choice(self.proxies_pool)
            if 'ConnectTimeoutError' in str(e):
                self.proxies_pool = 获取代理列表()
                if self.proxies_pool:
                    self.proxies = random.choice(self.proxies_pool)
            return '请求try失败' + str(e)
        # 解析数据
        if self.res.status_code != 200:
            return '请求失败' + str(self.res.status_code)
        data = json.loads(self.res.text)
        ret = data['ret'][0]
        match ret:
            case 'SUCCESS::调用成功':
                print(f"调用成功 {self.data['data']}")
                self.结果列表 = data['data']['resultList']
                #  咸鱼接口在 resultInfo 中返回 hasNextPage，爬虫据此决定是否继续翻页
                self.有下一页 = data.get('data', {}).get('resultInfo', {}).get('hasNextPage', False)
                if not self.有下一页:
                    print("没有下一页:")
                return '获得成功'
            case 'FAIL_SYS_TOKEN_EXOIRED::令牌过期':
                print("令牌过期")
                # 更新令牌，再给配置写上令牌
                self.续期令牌()
                return '令牌过期'
            # 第1次使用必定是非法令牌，就是需要用非法的去拿合法的。
            case 'FAIL_SYS_TOKEN_INVALID::非法令牌':
                print("非法令牌")
                self.续期令牌()
                return '非法令牌'
            case 'FAIL_SYS_TOKEN_ILLEGAL::非法令牌':
                print(f"非法令牌 【如果设置了随机生成隐私，启动时会随机掉令牌属于正常现象，马上拿到合法令牌就正常了】")
                self.续期令牌()
                return '非法令牌'
            case 'FAIL_SYS_PARAMINVALID_ERROR::请求参数非法':
                print("请求参数非法")
                return '请求参数非法'
            case _:
                print("其他失败：   " + str(ret))
                return '其他失败：' + str(ret)
    def 生成商品信息并推送(self):
        """制作商品列表，剔除已推送且没降价的，用于推送提示自己"""
        good_record = 配置.读取JSON(配置.商品记录路径)
        push_list = []
        for item in self.结果列表:
            item = item['data']['item']['main']
            good = 商品类()
            good.商品ID = item['exContent']['detailParams']['itemId']
            good.售价 = item['exContent']['detailParams']['soldPrice']
            if good.商品ID in good_record and good.售价 >= good_record[good.商品ID]:
                del good
                continue
            good.标题 = item['exContent']['detailParams']['title']
            good.地区 = item['exContent']['area']
            good.图片 = item['exContent']['picUrl']
            good.链接 = 'https://www.goofish.com/item?id=' + item['exContent']['detailParams']['itemId']
            good_record[good.商品ID] = good.售价
            push_list.append(good)
        self.推送商品(push_list)
        配置.写入JSON(good_record, 配置.商品记录路径)
    def 推送商品(self, push_list: list[商品类]):
        """推送商品提示自己（按配置开关决定是否走微信公众号）"""
        if 微信推送是否开启():
            for item in push_list:
                微信推送商品(
                    item.商品ID,
                    item.标题,
                    item.售价,
                    item.地区,
                    item.图片,
                    item.链接,
                )
