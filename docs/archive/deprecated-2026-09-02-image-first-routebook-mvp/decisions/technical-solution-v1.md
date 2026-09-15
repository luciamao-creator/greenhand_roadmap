# 新手徒步离线路书 MVP 技术方案 V1

## 1. 文档信息

- 状态：V1 待评审

- 日期：2026-09-02

- 适用范围：MVP 技术设计

- 关联需求：`docs/requirements/mvp-prd-v1.md`

- 关联决策：`docs/decisions/2026-09-02-mvp-product-decisions.md`

- 上位约束：`SOUL.md`

## 2. 技术目标

- 支撑微信小程序 MVP；

- 以 `离线路书包` 为核心产品对象；

- 支撑路线发现、路线详情、离线路书、天气预警、checklist；

- 支撑首批人工内容生产与后台维护；

- 为未来 APP 化和更强离线能力预留扩展空间。

## 3. 总体架构

### 3.1 前端

- `微信小程序`

- 负责：

  - 路线浏览；

  - 路线详情展示；

  - 路书包下载与本地缓存；

  - 在途路书页；

  - checklist；

  - 天气 banner 与官方预警跳转。

### 3.2 服务端

- 推荐方案：

  - `Next.js + API Routes` 作为一体化 MVP；

  - 或 `NestJS` 作为后续独立服务演进方向。

- MVP 优先推荐 `Next.js`，原因：

  - 研发速度快；

  - 方便同时承载后台管理与 API；

  - 适合内容型产品早期快速迭代。

### 3.3 管理后台

- `Next.js` 后台 CMS；

- 负责：

  - 路线内容录入；

  - 地图图像上传与管理；

  - 关键节点配置；

  - 禁区配置；

  - checklist 配置；

  - 天气与应急联系配置；

  - 发布状态管理。

### 3.4 数据存储

- `PostgreSQL`

- 推荐启用 `PostGIS`，用于：

  - 路线 polyline；

  - 关键点坐标；

  - 禁区 polygon；

  - 下撤点；

  - 地图点位聚合。

### 3.5 对象存储

- 存储路线封面图、处理过的地图图像、参照物图片、离线路书包资源。

## 4. 核心技术原则

- 本地图像优先，在线地图辅助；

- 数据结构围绕 `离线路书包` 组织；

- 内容生产与客户端消费解耦；

- 允许 MVP 先以人工编辑为主，不追求自动化生产；

- 明确避免对外承诺完整离线导航。

## 5. 离线路书包设计

### 5.1 定义

- 离线路书包是某条路线可供本地缓存和离线打开的内容集合。

### 5.2 路书包内容组成

- `manifest.json`

- 路线基础信息

- 总览图

- 分段图

- 重点岔路图

- 禁区重点图

- 关键参照物卡片图片

- 路线 polyline 和关键点数据

- checklist 模板

- 下撤点与应急联系

- 天气说明与官方预警入口配置

### 5.3 建议目录结构

```text
route-pack/
├── manifest.json
├── route.json
├── images/
│   ├── overview-map.jpg
│   ├── stage-1-map.jpg
│   ├── stage-2-map.jpg
│   ├── fork-a-map.jpg
│   ├── forbidden-zone-map.jpg
│   └── landmark-*.jpg
├── weather.json
├── checklist.json
└── emergency.json
```

### 5.4 manifest 建议字段

- `routeId`

- `version`

- `updatedAt`

- `title`

- `province`

- `offlineAssets`

- `stageCount`

- `hasWeatherBanner`

- `checklistVersion`

## 6. 处理过的地图图像方案

### 6.1 设计目标

- 让新手以更低认知成本理解路线，而不是读取抽象轨迹。

### 6.2 图像类型

- `总览图`：全程路线、起终点、下撤点、禁区概览；

- `分段图`：把路线拆成 2-4 个阶段；

- `岔路图`：重点岔路附近局部放大；

- `禁区图`：展示不要进入区域；

- `参照物图`：真实场景照片或编辑过图片。

### 6.3 生成方式

- MVP 阶段以 `人工编辑 + 半自动模板` 为主；

- 后台上传原始底图截图或底图导出图；

- 在设计模板中叠加：

  - 路线线条；

  - 节点标记；

  - 禁区遮罩；

  - 下撤点；

  - 说明文字；

  - 方向提示。

### 6.4 为什么不优先做纯动态绘制

- 小程序弱网场景下，动态绘制依赖更多运行时数据与渲染稳定性；

- 处理过的静态图更适合突出关键信息；

- 编辑质量更可控，更符合产品审美目标。

## 7. 数据模型

### 7.1 Route

- `id`

- `title`

- `province`

- `city`

- `summary`

- `distanceKm`

- `durationMinutes`

- `elevationGain`

- `difficultyLevel`

- `seasonTips`

- `suitableFor`

- `status`

### 7.2 RouteTag

- `id`

- `routeId`

- `category`

- `label`

- `priority`

### 7.3 Waypoint

- `id`

- `routeId`

- `name`

- `type`

- `orderIndex`

- `lat`

- `lng`

- `description`

### 7.4 Landmark

- `id`

- `routeId`

- `waypointId`

- `title`

- `imageUrl`

- `recognitionHint`

### 7.5 HazardZone

- `id`

- `routeId`

- `name`

- `type`

- `polygon`

- `warningText`

### 7.6 ExitPoint

- `id`

- `routeId`

- `name`

- `lat`

- `lng`

- `conditionText`

### 7.7 EmergencyContact

- `id`

- `routeId`

- `name`

- `phone`

- `type`

- `note`

### 7.8 ChecklistTemplate

- `id`

- `routeId`

- `version`

- `items`

- `weatherVariant`

## 8. API 设计建议

- `GET /api/routes`

- `GET /api/routes/:id`

- `GET /api/routes/:id/pack-manifest`

- `GET /api/routes/:id/offline-pack`

- `GET /api/routes/:id/weather`

- `GET /api/routes/:id/checklist`

- `GET /api/map/spots`

- `GET /api/routes/:id/emergency`

后台管理接口：

- `POST /api/admin/routes`

- `PUT /api/admin/routes/:id`

- `POST /api/admin/routes/:id/assets`

- `POST /api/admin/routes/:id/publish`

## 9. 小程序端模块划分

- `discover`：地图发现与线路列表

- `route-detail`：路线详情

- `offline-pack`：下载、更新、删除、缓存状态

- `on-route`：在途路书页

- `weather`：天气 banner 与详情

- `checklist`：出发前检查

- `emergency`：应急联系

## 10. 管理后台模块划分

- 线路基础信息管理

- 标签管理

- 关键节点管理

- 路书图像管理

- 禁区管理

- checklist 模板管理

- 天气与应急联系管理

- 发布与版本管理

## 11. 缓存策略

- 路书包按路线粒度下载；

- 客户端记录路书包版本；

- 若服务端版本更新，可提示重新下载；

- 图片、JSON、checklist 配置统一纳入本地缓存目录；

- 离线时优先走本地 manifest 和图片资源。

## 12. 天气与预警策略

- 服务端统一聚合天气 API，减少小程序端复杂度；

- 小程序展示简化信息：

  - 当前天气；

  - 当日风险提示；

  - 是否存在预警；

- 详情页跳转官方预警说明页面或官方链接。

## 13. 安全与风险控制

- 不提供“离线导航成功保障”式文案；

- 明确这是辅助判断工具，不替代用户和现场管理要求；

- 路线状态支持下线和风险更新；

- 高风险天气下支持线路强提醒或临时下架。

## 14. MVP 研发优先级

### P0

- 路线列表与详情；

- 离线路书包下载；

- 本地图像展示；

- 在途路书页；

- checklist；

- 天气 banner；

- 基础后台配置。

### P1

- 路书包版本更新提醒；

- 更丰富的标签与筛选；

- 更精细的岔路图管理；

- 后台审核流。

### P2

- 账号体系；

- 收藏、成就；

- 更强通知和留存能力；

- APP 扩展方案。

## 15. 技术风险

- 地图图像生产成本高，需要内容生产流程支撑；

- 小程序缓存容量与资源管理需要设计；

- 天气与预警数据源稳定性需要验证；

- 若后续要求真离线底图或更强在途能力，可能需要升级架构并转向 APP。

## 16. 未来扩展预留

- 为 APP 版本预留统一的数据结构；

- 离线路书包格式保持平台无关；

- 后台内容模型尽量不绑定微信小程序前端实现。

