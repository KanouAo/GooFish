import time
import requests
import os
import json
from ruamel.yaml import YAML
yaml = YAML(typ='rt')
option_path='wechat_option.yaml'
if os.path.exists('test_wechat_option.yaml'):
    option_path='test_wechat_option.yaml'
# 定义一个函数，用于获取微信的access_token
def get_token(appID,appsecret):
    url_token = 'https://api.weixin.qq.com/cgi-bin/token?'
    res = requests.get(url=url_token,params={
             "grant_type": 'client_credential',
             'appid':appID,
             'secret':appsecret,
             }).json()
    token = res.get('access_token')
    return token
#读取配置文件
def read_option(option_path):
    with open(option_path, 'r', encoding='utf-8') as stream:
        return yaml.load(stream)
#写入配置文件
def write_option(option,option_path):
    with open(option_path, 'w', encoding='utf-8') as stream:
        yaml.dump(option, stream)

#发送模板消息
def send_good_msg(token,template_id,userID,itemId,title,soldPrice,area,picUrl,itemUrl,color='#FF0000'):
    url_msg = 'https://api.weixin.qq.com/cgi-bin/message/template/send?'
    body = {
        "touser": userID,  # 这里必须是关注公众号测试账号后的用户id
        "template_id": template_id,
        "url": itemUrl,
        "topcolor": color,
        "data": {
            "title":{
                "value": title,
                "color": color
            },
            "soldPrice":{
                "value": soldPrice,
                "color": color
            },
            "id":{
                "value": itemId,
                "color": color
            },
            "area":{
                "value": area,
                "color": color
            },
            "other":{
                "value": picUrl,
                "color": color
            },
        }
    }
    res = requests.post(url=url_msg, params={
        'access_token': token  # 这里是我们上面获取到的token
    }, data=json.dumps(body, ensure_ascii=False).encode('utf-8'))
    return res
def send_good(itemId,title,soldPrice,area,picUrl,itemUrl):
    option = read_option(option_path)
    userID = option['userid']
    template_id =option['template_id']
    res = send_good_msg(option['token'],template_id,userID,itemId,title,soldPrice,area,picUrl,itemUrl)
    time.sleep(1)# 发送延迟
    errcode = res.json()['errcode']
    if(errcode==42001 or errcode==40001): # token过期后重新获取
        option['token']=get_token(option['appID'],option['appsecret'])
        write_option(option,option_path)
        res = send_good_msg(option['token'],template_id,userID,itemId,title,soldPrice,area,picUrl,itemUrl)
    return res.json()