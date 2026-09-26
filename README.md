# 新手徒步路线库 · greenhand_roadmap

帮徒步新手找到**值得去、看得懂、走得稳**的成熟路线。不是硬核登山工具，而是一个面向手机端的路线发现 + 问答 + 地图导航的小应用。

当前收录 **34 条真实线路**的语料（里程、耗时、爬升、路面、季节、风险点、下撤点、起终点坐标与高德步行轨迹）。

在线体验（测试域名，微信内打开会有平台的风险提醒中间页，点「确定访问」即可进入）：
`https://greenhand-roadmap-318303-12-1353632569.sh.run.tcloudbase.com`

## 功能

| 模块 | 说明 |
| --- | --- |
| 首页推荐 | 按省份/难度/偏好筛选线路卡片，支持定位所在省份 |
| 智能问答 | 基于线路语料的 RAG 问答；可「聚焦某条线路」后连续追问，回答只围绕该线路 |
| 地图 | 高德地图渲染真实步行轨迹，标注起点、终点、关键节点、风险点、下撤点；支持「跟随导航」实时定位 |
| 出发前清单 | 按交通/装备/安全等维度，从语料原文生成可勾选清单，并附原文出处 |
| 账号 | 注册登录、收藏线路（会话 Cookie 由 `AUTH_SECRET` 签名） |
| 投稿与后台 | 用户提交新线路 → 落盘待审 → `/admin` 后台查看与审核 |

## 技术栈

- **Next.js 15.5**（App Router）+ **React 19** + TypeScript + Tailwind CSS
- **高德地图**：Web 端 JS API（地图渲染）+ Web 服务（步行轨迹规划）
- **阿里云百炼 DashScope**：`qwen-plus` 负责对话生成，`text-embedding-v3` 负责向量化
- **检索**：自建轻量向量索引 `data/rag/route-index.json`（每条线路 4 类 chunk：identity / profile / description / geo），余弦相似度召回
- **存储**：线路语料为**仓库内文件化** `data/routes/*.json`，不依赖数据库即可运行；账号与投稿可选 PostgreSQL 或腾讯云 COS 做持久化

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env.local   # 填入高德 Key、百炼 API Key 等

# 3. 本地启动
npm run dev                  # http://localhost:3000
```

最小可运行只需要两组密钥：**高德 Web 端 JS API Key**（含安全密钥）+ **百炼 API Key**。未配置百炼 Key 时，向量检索不可用，线路列表会返回空。

其他常用命令：

```bash
npm run build       # 生产构建
npm run typecheck   # 类型检查
npm run db:migrate  # 可选：接入 PostgreSQL 后建表
```

## 环境变量

完整清单与申请入口见 [`.env.example`](./.env.example)，核心项：

| 变量 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_AMAP_JS_KEY` / `NEXT_PUBLIC_AMAP_SECURITY_CODE` | 高德 Web 端地图（浏览器侧） |
| `AMAP_WEB_SERVICE_KEY` | 高德 Web 服务，服务端规划步行轨迹 |
| `AGENT_PREFILL_API_KEY` | 百炼 DashScope，对话生成 + embedding 共用 |
| `AUTH_SECRET` | 登录会话 Cookie 的 HMAC 签名密钥，**生产必填** |
| `ADMIN_VIEW_TOKEN` | `/admin` 后台与投稿列表接口的查看口令，**生产必填**（缺失则后台锁定） |
| `DATABASE_URL` 或 `COS_*` 四件套 | 可选，账号/投稿的持久化（都不配则回退容器本地文件，实例重建即丢） |

> 注意：`.env`、`.env.local` 已在 `.gitignore` 中排除，请勿把真实密钥提交进仓库。

## 数据组织

```
data/
  routes/rt_*.json        34 条线路语料（base_facts / metrics / narrative / geometry）
  rag/route-index.json    向量索引（构建产物，随语料变更重建）
```

线路语料是**人工校验过的结构化数据**：`geometry.start_point` / `end_point` 与 `amap_walking_path` 轨迹同源，起终点与轨迹首尾偏差在十几米量级。

## 部署

部署在**腾讯云 CloudBase 云托管**（容器型），产物为 standalone 自包含目录：

```bash
npm run build
cp -R .next .deploy/.next
tcb cloudrun deploy -e <envId> -s greenhand-roadmap --source ./.deploy --port 3000 \
  --min-num 1 --max-num 1 --open-access-types PUBLIC --force
```

> 云托管分配的是**默认域名**，平台会强制展示「仅供开发测试」的中间页，且对访问量异常波动保留关停权利。**移除中间页的唯一合规途径是绑定已完成 ICP 备案的自定义域名**，这与代码无关。

## 当前状态与已知限制

本项目目前处于 **MVP 冻结**状态，功能完整可用，以下是运行环境的既有边界（不是缺陷）：

1. **容器文件系统非持久**：云托管每次部署替换镜像，运行时写入的 `data/submissions/` 投稿会丢失；线路主池读的是镜像内的 `data/routes`，同理。生产级用法需改接数据库或对象存储。
2. **后台鉴权未配置**：线上未设置 `ADMIN_VIEW_TOKEN`，生产环境下 `/admin` 与 `GET /api/admin/submissions` 处于锁定状态（401）——这是刻意的安全兜底，配置该变量即可开启。
3. **会话状态在浏览器侧**：对话历史存 `sessionStorage`、定位结果存 `localStorage`，微信彻底杀掉页面后可能丢失。
4. **索引重建为全量**：每次发布会重算全部线路的 embedding（约 136 个片段），量级很小，但设计上应改为增量。

## Roadmap（下一步）

按优先级排列，均为增量改进，不影响当前功能使用：

1. **投稿自动并入线路主池**（优先）：投稿落盘、后台查看、审核接口都已可用，待补的是「审核通过 → 写入 `data/routes` 并增量重建索引」这一跳。目前 `publish` 只改仓库状态，**因此审核通过的新线路需要人工把它的 JSON 合入 `data/routes/`，才会出现在用户端检索结果中**。
2. **运行时数据持久化**：投稿与账号数据接入 PostgreSQL 或腾讯云 COS，摆脱"部署即丢"。
3. **索引增量重建**：只对新线路/变更线路计算 embedding，替代当前的全量重算。
4. **正式域名**：绑定已完成 ICP 备案的自定义域名，移除默认域名的访问提醒中间页，以便对外分发。
5. **投稿数据校验**：入库前校验坐标与里程等必填字段，避免缺字段的线路退化成"起终点虚线"。

## License

[MIT](./LICENSE) © 2026 greenhand_roadmap contributors
