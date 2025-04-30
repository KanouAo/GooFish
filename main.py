import hashlib
import json
import os
import random
import threading
from bs4 import BeautifulSoup
from ruamel.yaml import YAML
import time
import requests
import utils as utils
from wechat_service import send_good as wechat_service_send

yaml = YAML(typ='rt')

option = None
option_path = 'option.yaml'
if os.path.exists('test_option.yaml'):
    option_path='test_option.yaml'
good_record_path= 'good_record.json'
def read_option_yaml():
    with open(option_path, 'r', encoding='utf-8') as stream:
        return yaml.load(stream)

def update_option_yaml():
    with open(option_path, 'w', encoding='utf-8') as outfile:
        yaml.dump(option, outfile)

def read_json(filepath):
    with open(filepath, 'r', encoding='utf-8') as file:
        return json.load(file)

def write_json(data,filepath):
    with open(filepath, 'w', encoding='utf-8') as file:
        json.dump(data, file, ensure_ascii=False, indent=4)

def set_random_option():
    option['cookies']['cna']=utils.generate_random_str(24)
    option['cookies']['t']=utils.generate_random_str(32,digits=True,lowercase=True)
    option['cookies']['_tb_token_']=utils.generate_random_str(16,digits=True,lowercase=True)
    option['cookies']['cookie2']=utils.generate_random_str(32,digits=True,lowercase=True)
    option['cookies']['_m_h5_tk']=utils.generate_random_str(32,digits=True,lowercase=True)+'_'+str(int(round(time.time() * 1000)))
    option['cookies']['_m_h5_tk_enc']=utils.generate_random_str(32,digits=True,lowercase=True)
    pass

def test_ip(proxy):
    '''检测ip是否可以使用'''
    proxies = {
        "http": "http://" + proxy,
        "https": "http://" + proxy,
    }
    try:
        response = requests.get(url='http://www.baidu.com',headers=option['headers'],proxies=proxies) #没设置timeout，使响应等待1s，有的免费代理时间长但能用 http://ifconfig.me/ip 这个测IP的有时测代理反而连不上
        response.close()
        if response.status_code == 200:
            return True
        else:
            return False
    except Exception as e:
        print(e)
        return False

def get_proxies():
    '''优先使用配置里的代理池'''
    proxies = []
    for p in option['proxies']:
        proxy={
            "http": p,
            "https": p
        }
        if test_ip(p):
            proxies.append(proxy)
    if len(proxies)==0:
        print('配置文件里没有可用的代理')
    return proxies

class good_class:
    '''单个商品'''
    itemId=''
    title=''
    soldPrice=''
    area=''
    picUrl=''
    itemUrl=''

class 物品信息类:
    headers = {}
    cookies = {}
    params = {}
    data = {}#搜索用的合并的data
    search_data={}#配置文件里未合并的散乱搜索用data
    proxies = {}
    proxies_pool = []
    black_proxies_pool = []
    url=f'https://h5api.m.goofish.com/h5/mtop.taobao.idlemtopsearch.pc.search/1.0/'
    res={}
    resultList=[]
    good_list=[]#用于推送的商品列表
    def __init__(self,search_data):
        if option['use_proxy']:
            self.proxies_pool=get_proxies()
            if self.proxies_pool:
                self.proxies=random.choice(self.proxies_pool)
        self.headers=option['headers']
        self.cookies=option['cookies']
        self.params=option['params']
        self.search_data=search_data
        self.make_search_data()
        # if self.search_data['data']=='':
        #     self.make_search_data()
        # else:
        #     self.data=self.search_data

    def make_token(self):
        '''制作令牌'''
        new_cookies = requests.utils.dict_from_cookiejar(self.res.cookies)
        self.cookies['_m_h5_tk'] = new_cookies['_m_h5_tk']
        self.cookies['_m_h5_tk_enc'] = new_cookies['_m_h5_tk_enc']
        update_option_yaml()
        pass
    def make_search_data(self):
        '''制作搜索用的数据'''
        # data: {"pageNumber":1,"keyword":"电脑","fromFilter":true,"rowsPerPage":30,"sortValue":"desc","sortField":"reduce","customDistance":"","gps":"","propValueStr":{"searchFilter":"quickFilter:filterPersonal,filterAppraise,gameAccountInsurance,filterFreePostage,filterHighLevelYxpSeller,filterNew,inspectedPhone,filterOneKeyResell;"},"customGps":"","searchReqFromPage":"pcSearch","extraFilterValue":"{\"divisionList\":[],\"excludeMultiPlacesSellers\":\"0\",\"extraDivision\":\"江浙沪\"}","userPositionJson":"{}"}
        pageNumber=self.search_data['pageNumber']
        keyword=self.search_data['keyword']
        fromFilter=self.search_data['fromFilter']
        rowsPerPage=self.search_data['rowsPerPage']
        sortValue=self.search_data['sortValue']
        sortField=self.search_data['sortField']
        customDistance=self.search_data['customDistance']
        gps=self.search_data['gps']
        propValueStr='{}'
        string=""
        publishDays=self.search_data['propValueStr']['searchFilter']['publishDays']
        priceRange=self.search_data['propValueStr']['searchFilter']['priceRange']
        quickFilter=self.search_data['propValueStr']['searchFilter']['quickFilter']
        if publishDays and sortField!="create":#如果sortField是新发布，则不添加发布日期过滤
            string=string+"publishDays:"+publishDays+";"
        if priceRange:
            string=string+"priceRange:"+priceRange+";"
        if quickFilter:
            string=string+"quickFilter:"+quickFilter+";"
        if string:
            propValueStr='{"searchFilter":"'+string+'"}'
        customGps=self.search_data['customGps']
        searchReqFromPage=self.search_data['searchReqFromPage']
        extraFilterValue=self.search_data['extraFilterValue']
        userPositionJson=self.search_data['userPositionJson']
        data = {
            "pageNumber": pageNumber,
            "keyword": keyword,
            "fromFilter": fromFilter,
            "rowsPerPage": rowsPerPage,
            "sortValue": sortValue,
            "sortField": sortField,
            "customDistance": customDistance,
            "gps": gps,
            "propValueStr": propValueStr,
            "customGps": customGps,
            "searchReqFromPage": searchReqFromPage,
            "extraFilterValue": extraFilterValue,
            "userPositionJson": userPositionJson
        }
        
        data=f'{{"pageNumber":{pageNumber},"keyword":"{keyword}","fromFilter":{fromFilter},"rowsPerPage":30,"sortValue":"","sortField":"","customDistance":"","gps":"","propValueStr":{propValueStr},"customGps":"","searchReqFromPage":"pcSearch","extraFilterValue":"{extraFilterValue}","userPositionJson":"{userPositionJson}"}}'
        self.data['data']=data

    def get_page(self):
        #时间戳
        t_now=str(int(round(time.time() * 1000)))
        self.params['t'] = str(t_now)
        #签名
        sign_data=self.cookies['_m_h5_tk'].split('_')[0] + "&" + t_now + "&" + self.params['appKey'] + "&" + self.data["data"]
        self.params['sign']=hashlib.md5(sign_data.encode(encoding='UTF-8')).hexdigest()
        #构建链接
        try:
            if option['use_proxy'] and self.proxies:
                self.res=requests.post(self.url, headers=self.headers,cookies=self.cookies, params=self.params,data=self.data,proxies=self.proxies)
            else:
                self.res=requests.post(self.url, headers=self.headers,cookies=self.cookies, params=self.params,data=self.data)
            self.res.close()
        except Exception as e:
            if '由于目标计算机积极拒绝' in str(e):
                self.proxies_pool=get_proxies()
                if self.proxies_pool:
                    self.proxies=random.choice(self.proxies_pool)
            if 'ConnectTimeoutError' in str(e):
                self.proxies_pool=get_proxies()
                if self.proxies_pool:
                    self.proxies=random.choice(self.proxies_pool)
            return '请求try失败'+str(e)
        #解析数据
        if self.res.status_code != 200:
            return '请求失败'+str(self.res.status_code)
        data = json.loads(self.res.text)
        ret=data['ret'][0]
        match ret:
            case 'SUCCESS::调用成功':
                self.resultList = data['data']['resultList']
                return '获得成功'
            case 'FAIL_SYS_TOKEN_EXOIRED::令牌过期':
                #更新令牌, 再给配置写上令牌
                self.make_token()
                return '令牌过期'
            case 'FAIL_SYS_TOKEN_INVALID::非法令牌':
                self.make_token()
                return '非法令牌'
            case 'FAIL_SYS_TOKEN_ILLEGAL::非法令牌':
                self.make_token()
                return '非法令牌'
            case 'FAIL_SYS_PARAMINVALID_ERROR::请求参数非法':
                return '请求参数非法'
            case _:
                print("其他失败：   "+str(ret))
                return '其他失败'

    def make_good_list_and_push(self):
        '''制作商品列表，剔除已推送且没降价的，用于推送提示自己'''
        good_record=read_json(good_record_path)
        push_list=[]
        for item in self.resultList:
            item=item['data']['item']['main']
            good=good_class()
            good.itemId=item['exContent']['detailParams']['itemId']
            good.soldPrice=item['exContent']['detailParams']['soldPrice']
            if good.itemId in good_record and good.soldPrice>=good_record[good.itemId]:
                del good
                continue
            good.title=item['exContent']['detailParams']['title']
            good.area=item['exContent']['area']
            good.picUrl=item['exContent']['picUrl']
            good.itemUrl='https://www.goofish.com/item?id='+item['exContent']['detailParams']['itemId']
            good_record[good.itemId]=good.soldPrice
            push_list.append(good)
            # print(item['data']['item']['main']['clickParam']['args']['tagname'])
            # print(item['data']['item']['main']['clickParam']['args']['serviceUtParams'])
            # print(item['data']['item']['main']['exContent']['userNickName'])
            # print(item['data']['item']['main']['exContent']['fishTags']['r1']['tagList'][0]['data']['content'])
            # print(item['data']['item']['main']['exContent']['fishTags']['r2']['tagList'][0]['data']['content'])
            # print(item['data']['item']['main']['exContent']['fishTags']['r3']['tagList'][0]['data']['content'])
            # print(item['data']['item']['main']['exContent']['fishTags']['r4']['tagList'][0]['data']['content'])
        self.push_good(push_list)
        write_json(good_record,good_record_path)

    def push_good(self,push_list:list[good_class]):
        '''推送商品提示自己'''
        if option['push']['wechat_service']:
            for item in push_list:
                wechat_service_send(item.itemId,item.title,item.soldPrice,item.area,item.picUrl,item.itemUrl)

class LoopThread(threading.Thread):
    物品信息=None
    retry_max=5#最大重试次数
    repeat_sleep=3600#每次查询时间间隔
    def __init__(self, name):
        threading.Thread.__init__(self)
        self.name = name
        self.retry_max=option['retry_max']#最大重试次数
        self.repeat_sleep=option['repeat_sleep']#每次查询时间间隔

    def run(self):
        print(f"Thread {self.name} is starting")
        物品信息列表:list[物品信息类]=[]#查找多个不同物品
        for search_data in option['good']:
            物品信息=物品信息类(search_data)
            物品信息列表.append(物品信息)
        while True:
            for 物品信息 in 物品信息列表:
                #重复到最大指定次数直到获得数据
                for count in range(self.retry_max):
                    time.sleep(random.uniform(0,1))
                    time.sleep(random.randint(1, 2))
                    ret=物品信息.get_page()
                    if ret == '获得成功':
                        break
                    else:
                        print(str(ret)+" 重试次数："+str(count))
                #获得成功
                if ret == '获得成功':
                    self.retry_max=0
                    物品信息.make_good_list_and_push()
                else:
                    print("重试超过次数，请检查")
                print(ret)
                delay=random.randint(5, self.repeat_sleep)
                time.sleep(random.uniform(0,1))
                for i in range(delay):
                    time.sleep(1)

if __name__ == '__main__':
    option=read_option_yaml()
    if option['random_option']:
        set_random_option()
    # 创建并启动线程
    thread = LoopThread("LoopThread")
    thread.start()

'''
#打开浏览器形式的爬虫
from DrissionPage import SessionPage,Chromium
import requests
tab = Chromium().latest_tab
tab.get(f'https://www.goofish.com/search?q=%E7%94%B5%E8%84%91&spm=a21ybx.search.searchInput.0')  # 访问网址，这行产生的数据包不监听
tab.listen.start('https://h5api.m.goofish.com/h5/mtop.taobao.idlemtopsearch.pc.search/1.0/')  # 开始监听，指定获取包含该文本的数据包
res = tab.listen.wait(timeout=10)
data = res.response.body
resultList = data['data']['resultList']
for item in resultList:
    print(item)
'''
