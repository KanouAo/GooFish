# 前后端合体：Python 后端 Mock API + 前端切换真实通信

## 背景
- 前端 `Ui/`（React + antd）已完成，目前靠 `src/mock/` 纯前端假数据运行
- 前端当初预留了双通道适配层：[request.ts](file:///c:/Tools/GooFish/Ui/src/utils/request.ts) 按 `VITE_USE_MOCK` 切换本地 Mock / axios 真实请求；[vite.config.ts](file:///c:/Tools/GooFish/Ui/vite.config.ts) 预留了 `/api` proxy 注释
- 现在接入 Python 后端（`Server/`）：**第一阶段后端只用内存假数据，不真实爬咸鱼**；[main.py](file:///c:/Tools/GooFish/Server/main.py)（真实爬虫 + LoopThread）本轮完全不动，以后再逐步接入
- API 契约直接照搬 [handlers.ts](file:///c:/Tools/GooFish/Ui/src/mock/handlers.ts) 的 31 条路由，统一响应 `{code:0, message, data}`，字段名中文（与前端 `types/biz.ts` 一致，符合中文命名习惯）

## 改动内容

### Python 侧（新建 2 个文件，不改 main.py，不装任何新依赖）

**1. `Server/fake_data.py` — 内存假数据库**
- 把 `Ui/src/mock/db.ts` 的种子翻译成 Python dict/list：8 个搜索任务、48 条商品、黑名单 2 条、待处理 3 条、执行记录 18 条、推送记录 12 条、推送配置、系统配置、调度状态
- dict 的 key 用中文（`关键词`、`价格`、`所属关键词`…），与前端接口字段一一对应
- 实现同款工具函数：`偏移时间(小时)`、`格式化时间`、`生成占位图(文字)`（内联 SVG data URI，与 db.ts 一致）
- 暴露全局可变 `数据库` 对象，供路由处理器读写；进程重启即重置（预期行为）

**2. `Server/api_server.py` — HTTP 服务入口（Python 标准库 `http.server`，零新依赖）**
- `ThreadingHTTPServer` + `BaseHTTPRequestHandler`，监听 `127.0.0.1:8000`（vite 注释里预留的端口）
- 轻量路由表：`方法 + 正则`（如 `/tasks/:id` → `^/tasks/(?P<id>[^/]+)$`）；**静态路径优先于参数路径匹配**（`/goods/blacklist` 必须先于 `/goods/:id`，`/goods/blacklist/clear` 先于 `/goods/blacklist/:id/restore`）
- 统一响应：成功 `{code:0, message:'ok', data:...}`；处理器抛异常 → `{code:1, message:..., data:null}`（HTTP 状态码 200，业务码区分，与前端 request.ts 约定一致）；JSON 输出 `ensure_ascii=False` + UTF-8
- 全放行 CORS 头（方便不开 vite 时直连调试）
- 业务逻辑逐条对照 handlers.ts 实现，共 31 条路由：
  - 看板：`GET /dashboard/stats`
  - 任务：`GET/POST /tasks`、`PUT/DELETE /tasks/:id`、`PATCH /tasks/:id/status`、`POST /tasks/:id/run`（试跑产出待处理）
  - 商品：`GET /goods`（分页 + 所属关键词/标题/地区/价格区间/降价/收藏 筛选）、`DELETE /goods/:id`、`PATCH /goods/:id/collect`、`POST /goods/:id/blacklist`、`POST /goods/clear`、`GET /goods/pending`、`POST /goods/pending/:id/accept|blacklist`、`GET /goods/blacklist`、`POST /goods/blacklist/:id/restore`、`POST /goods/blacklist/clear`
  - 调度：`GET /scheduler/status`、`POST /scheduler/start|stop`、`PUT /scheduler/config`、`GET /scheduler/records`、`POST /scheduler/run/:taskId`（产出待处理）
  - 推送：`GET/PUT /push/config`、`GET /push/records`
  - 设置：`GET/PUT /settings`、`POST /settings/refresh-token`

### 前端侧（仅 2 处小改，业务代码零改动）

1. [vite.config.ts](file:///c:/Tools/GooFish/Ui/vite.config.ts)：启用 `server.proxy`，`'/api' → http://127.0.0.1:8000`，`rewrite` 去掉 `/api` 前缀（Python 路由不带前缀，与 handlers.ts 完全一致）
2. [.env](file:///c:/Tools/GooFish/Ui/.env)：`VITE_USE_MOCK=false`（切回纯前端 Mock 只需改回 `true`，Mock 代码保留不删）

`request.ts`、`src/api/*`、各页面均不需要改动——这正是当初适配层预留的意义。

## 运行方式
```
终端1：cd c:\Tools\GooFish\Server ; python api_server.py
终端2：cd c:\Tools\GooFish\Ui ; pnpm dev
```
浏览器访问 http://localhost:5173 ，六个页面数据全部来自 Python 后端。

## 验证
1. 直击后端抽查 JSON：浏览器访问 `http://127.0.0.1:8000/tasks`、`/goods/pending`、`/scheduler/records`，确认 `{code:0,...}` 结构与中文字段
2. browser_use 走查 http://localhost:5173 全部页面（看板/任务/商品/调度/推送/设置），确认数据来自后端、无红色报错
3. 写操作验证：新建任务 → 试跑（待处理徽标增加）→ 待处理收录 → 商品拉黑 → 黑名单一键清空；重启 api_server 后数据重置为种子（预期）

## 待确认（默认按推荐执行，有异议直接说）
- HTTP 框架用 **Python 标准库**（不装 Flask/FastAPI）；如你偏好 Flask 告诉我
- `main.py` 本轮完全不动；后端假数据阶段不模拟真实爬取循环，调度接口只改内存状态
