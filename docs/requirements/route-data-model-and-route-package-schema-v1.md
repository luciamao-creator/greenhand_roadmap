# 新手徒步路线库 MVP 路线数据模型与路书包 Schema V1

## 1. 文档信息

- 状态：当前生效，待研发评审细化

- 日期：2026-09-04

- 适用范围：服务端数据建模、内容后台录入、发布产物定义、前后端联调

- 关联需求：`docs/requirements/mvp-prd-v2.md`

- 关联技术：`docs/decisions/technical-solution-v2.md`

- 关联字段：`docs/requirements/page-level-field-spec-v1.md`

- 上位约束：`SOUL.md`

## 2. 文档目标

- 定义 MVP 阶段的路线结构化数据模型；

- 定义客户端消费的 `route package` 发布包结构；

- 明确哪些字段属于人工确认真相，哪些字段属于 AI 可解释层；

- 明确路线内容从录入、审核到发布的最小数据闭环；

- 为后续数据库表设计、API 设计、前端模型设计提供单一事实来源。

## 3. 先说清楚：这里的“路书包”是什么

### 3.1 当前定义

- 本文中的 `路书包 / route package`，指的是 `一条已发布路线的轻量结构化发布包`；

- 它服务于：

  - 路线详情页展示；

  - 出发前准备页；

  - 在途导航页；

  - 弱网下的基础缓存；

  - 客户端版本化消费。

### 3.2 它不是什么

- 它不是旧方案中的 `图像优先离线路书包`；

- 它不包含大体量手工地图图像生产链；

- 它不依赖运行时 AI 生成核心地图真相；

- 它不是完整离线地图引擎数据包。

### 3.3 当前推荐理解

- `路线数据模型` 是后台权威事实层；

- `路书包` 是从权威事实层派生出来的可发布消费层；

- 前者服务录入、审核、运营和查询；

- 后者服务客户端展示、缓存和导航运行时。

## 4. 建模原则

### 4.1 真相优先级

- 第一优先：地图 API / 地图 SDK 同步后的结构化路线事实，以及人工审核通过后的结构化事实；

- 第二优先：天气与预警接口事实；

- 第三优先：客户端定位与本地状态；

- 第四优先：AI 解释、摘要和 FAQ 文案。

### 4.2 模型边界

- `允许结构化存储`

  - 路线基础事实；

  - 路线几何；

  - 关键节点；

  - 岔路点；

  - 下撤点；

  - 风险点；

  - 规则型 checklist 输入；

  - 审核与发布状态。

- `允许 AI 生成但必须可回溯`

  - 一句话摘要；

  - 为什么适合新手；

  - FAQ 回答；

  - checklist 原因解释；

  - 推荐解释；

  - 距离 / 时长 / 爬升等基础参数草稿；

  - 证据来源摘要草稿。

- `禁止 AI 直接定稿`

  - route polyline；

  - 地图 API 未给出的起终点真相；

  - 未经审核的关键节点位置；

  - 未经审核的下撤点位置；

  - 未经审核的风险点位置；

  - 地理边界；

  - 天气原始事实。

### 4.3 数据分层

- `录入层`

  - 内容编辑录入原始事实和证据。

- `审核层`

  - 审核通过后形成权威结构化模型。

- `发布层`

  - 基于结构化模型产出 route package。

- `消费层`

  - 客户端/API 读取 route package 或其聚合结果。

## 5. 顶层对象清单

MVP 路线数据模型建议由以下核心对象组成：

1. `route`
2. `route_geometry`
3. `route_stage`
4. `route_node`
5. `route_exit_point`
6. `route_risk_point`
7. `route_tag`
8. `route_weather_rule`
9. `route_checklist_profile`
10. `route_faq`
11. `route_source`
12. `route_user_report`
13. `route_publish_version`
14. `route_package`

## 6. 核心实体定义

## 6.1 `route`

路线主对象，承载路线级基础事实。

| 字段名                         | 类型           | 是否必填 | 说明                                                                 | 真相来源                   |
| --------------------------- | ------------ | ---- | ------------------------------------------------------------------ | ---------------------- |
| route\_id                   | string       | 必填   | 路线唯一 ID，如 `zj-hz-jiuxi-longjing-001`                               | 系统生成                   |
| route\_slug                 | string       | 必填   | 路由与可读标识                                                            | 系统生成/人工确认              |
| route\_name                 | string       | 必填   | 对外展示名称                                                             | 人工确认                   |
| province\_code              | string       | 必填   | 省份编码                                                               | 人工确认                   |
| province\_name              | string       | 必填   | 省份名                                                                | 人工确认                   |
| city\_name                  | string       | 必填   | 城市/区域                                                              | 人工确认                   |
| area\_name                  | string       | 选填   | 景区/片区名                                                             | 人工确认                   |
| route\_type                 | enum         | 必填   | `loop / out_and_back / one_way`                                    | 人工确认                   |
| route\_status               | enum         | 必填   | `draft / pending_review / approved / published / paused / retired` | 审核系统                   |
| credibility\_level          | enum         | 必填   | `A / B / C`                                                        | 审核系统                   |
| beginner\_friendly\_level   | enum         | 必填   | `high / medium / low`                                              | 人工确认                   |
| duration\_minutes           | integer      | 必填   | 建议总时长                                                              | 地图 API / Agent 补全后人工确认 |
| distance\_km                | decimal(5,1) | 必填   | 路线长度                                                               | 地图 API / Agent 补全后人工确认 |
| elevation\_gain\_m          | integer      | 必填   | 累计爬升                                                               | 地图 API / Agent 补全后人工确认 |
| max\_altitude\_m            | integer      | 选填   | 最高海拔                                                               | 地图 API / Agent 补全后人工确认 |
| best\_season\_text          | string       | 选填   | 推荐季节                                                               | 人工确认                   |
| start\_point\_name          | string       | 必填   | 起点名                                                                | 人工确认                   |
| end\_point\_name            | string       | 必填   | 终点名                                                                | 人工确认                   |
| transport\_summary          | string       | 选填   | 交通方式摘要                                                             | 人工确认                   |
| route\_logic\_summary       | string       | 必填   | 路线主逻辑摘要                                                            | 人工确认                   |
| exit\_logic\_summary        | string       | 必填   | 何时该收手/回撤摘要                                                         | 人工确认                   |
| easiest\_panic\_point\_text | string       | 必填   | 最容易慌的点                                                             | 人工确认                   |
| not\_for\_whom\_text        | string       | 必填   | 什么人先别去                                                             | 人工确认                   |
| summary\_short              | string       | 必填   | 一句话摘要，可人工覆盖 AI 结果                                                  | AI 生成后审核               |
| beginner\_fit\_reason       | string       | 必填   | 为什么适合新手                                                            | AI 生成后审核               |
| cover\_image\_url           | string       | 选填   | 封面图 URL                                                            | 对象存储                   |
| last\_verified\_at          | datetime     | 必填   | 最近人工核验时间                                                           | 审核系统                   |
| published\_at               | datetime     | 选填   | 发布时间                                                               | 发布系统                   |

## 6.2 `route_geometry`

路线几何对象，承载空间相关真相。

补充说明：

- 主轨迹、起终点、范围框优先来自地图 API / 地图 SDK 同步结果；

- 若地图 API 未返回可用空间真相，该路线应保持空间字段缺失，不允许以自由备注替代；

- 人工职责是审核、纠偏和接受待审提议，而不是凭感觉生成地图真相。

| 字段名                        | 类型                                      | 是否必填 | 说明       |
| -------------------------- | --------------------------------------- | ---- | -------- |
| route\_id                  | string                                  | 必填   | 关联路线     |
| geometry\_version          | integer                                 | 必填   | 几何版本号    |
| route\_polyline            | geojson\_linestring / encoded\_polyline | 必填   | 推荐路线主轨迹  |
| bounding\_box              | object                                  | 必填   | 路线包围盒    |
| start\_point               | point                                   | 必填   | 起点坐标     |
| end\_point                 | point                                   | 必填   | 终点坐标     |
| overview\_center           | point                                   | 必填   | 详情页默认中心点 |
| overview\_zoom             | number                                  | 选填   | 详情页默认缩放  |
| elevation\_profile\_points | array                                   | 选填   | 海拔剖面采样点  |
| map\_provider\_hint        | string                                  | 选填   | 推荐底图策略提示 |

`point` 结构：

```json
{
  "lng": 120.123456,
  "lat": 30.123456
}
```

`bounding_box` 结构：

```json
{
  "min_lng": 120.01,
  "min_lat": 30.01,
  "max_lng": 120.21,
  "max_lat": 30.21
}
```

## 6.3 `route_stage`

路线阶段对象，用于在途导航判断“当前走到哪一段”。

| 字段名                         | 类型      | 是否必填 | 说明                                             |
| --------------------------- | ------- | ---- | ---------------------------------------------- |
| stage\_id                   | string  | 必填   | 阶段 ID                                          |
| route\_id                   | string  | 必填   | 关联路线                                           |
| stage\_order                | integer | 必填   | 阶段顺序                                           |
| stage\_name                 | string  | 必填   | 阶段名称                                           |
| stage\_type                 | enum    | 必填   | `approach / climb / traverse / descent / exit` |
| start\_node\_id             | string  | 必填   | 阶段起点节点                                         |
| end\_node\_id               | string  | 必填   | 阶段终点节点                                         |
| stage\_summary              | string  | 必填   | 本段怎么走的说明                                       |
| expected\_duration\_minutes | integer | 选填   | 本段建议时长                                         |
| stage\_risk\_hint           | string  | 选填   | 本段风险提示                                         |

## 6.4 `route_node`

路线节点对象，统一描述关键点、岔路点、提示点。

| 字段名                      | 类型      | 是否必填 | 说明                                             |
| ------------------------ | ------- | ---- | ---------------------------------------------- |
| node\_id                 | string  | 必填   | 节点 ID                                          |
| route\_id                | string  | 必填   | 关联路线                                           |
| node\_type               | enum    | 必填   | `start / end / key / fork / view / checkpoint` |
| node\_name               | string  | 必填   | 节点名称                                           |
| point                    | point   | 必填   | 节点坐标                                           |
| stage\_order             | integer | 选填   | 所属阶段                                           |
| distance\_from\_start\_m | integer | 选填   | 距起点累计距离                                        |
| trigger\_radius\_m       | integer | 必填   | 提示触发半径                                         |
| navigation\_hint         | string  | 必填   | 接近节点时的提示                                       |
| wrong\_choice\_hint      | string  | 选填   | 容易走错时的纠偏文案                                     |
| display\_priority        | integer | 必填   | 展示优先级                                          |

## 6.5 `route_exit_point`

回撤/收手点对象。

| 字段名                   | 类型      | 是否必填 | 说明                                                 |
| --------------------- | ------- | ---- | -------------------------------------------------- |
| exit\_point\_id       | string  | 必填   | 下撤点 ID                                             |
| route\_id             | string  | 必填   | 关联路线                                               |
| exit\_name            | string  | 必填   | 下撤点名称                                              |
| point                 | point   | 必填   | 坐标                                                 |
| stage\_order          | integer | 选填   | 所属阶段                                               |
| exit\_type            | enum    | 必填   | `return / transport / safe_stop / scenic_turnback` |
| exit\_condition\_text | string  | 必填   | 什么情况下建议在这里收手                                       |
| exit\_action\_text    | string  | 必填   | 收手后怎么做                                             |
| exit\_priority        | enum    | 必填   | `primary / secondary`                              |

## 6.6 `route_risk_point`

风险点对象。

| 字段名                | 类型      | 是否必填 | 说明                                                                   |
| ------------------ | ------- | ---- | -------------------------------------------------------------------- |
| risk\_point\_id    | string  | 必填   | 风险点 ID                                                               |
| route\_id          | string  | 必填   | 关联路线                                                                 |
| risk\_type         | enum    | 必填   | `fork_confusion / slippery / exposure / weather / timing / crowding` |
| risk\_level        | enum    | 必填   | `low / medium / high`                                                |
| point              | point   | 必填   | 坐标                                                                   |
| stage\_order       | integer | 选填   | 所属阶段                                                                 |
| risk\_title        | string  | 必填   | 风险标题                                                                 |
| risk\_text         | string  | 必填   | 风险说明                                                                 |
| safe\_action\_text | string  | 必填   | 保守行动建议                                                               |
| trigger\_radius\_m | integer | 必填   | 触发半径                                                                 |

## 6.7 `route_tag`

路线标签对象。

| 字段名         | 类型      | 是否必填 | 说明                               |
| ----------- | ------- | ---- | -------------------------------- |
| route\_id   | string  | 必填   | 关联路线                             |
| tag\_group  | enum    | 必填   | `scenery / safety / achievement` |
| tag\_code   | string  | 必填   | 标签编码                             |
| tag\_name   | string  | 必填   | 标签名                              |
| is\_core    | boolean | 必填   | 是否核心标签                           |
| sort\_order | integer | 必填   | 排序                               |

## 6.8 `route_weather_rule`

天气与时间规则对象。

| 字段名               | 类型     | 是否必填 | 说明                                                 |
| ----------------- | ------ | ---- | -------------------------------------------------- |
| route\_id         | string | 必填   | 关联路线                                               |
| weather\_rule\_id | string | 必填   | 规则 ID                                              |
| scenario\_type    | enum   | 必填   | `rain / thunder / heat / cold / wind / late_start` |
| severity          | enum   | 必填   | `warn / avoid`                                     |
| rule\_text        | string | 必填   | 规则说明                                               |
| action\_text      | string | 必填   | 建议动作                                               |
| threshold\_config | json   | 选填   | 阈值配置                                               |

## 6.9 `route_checklist_profile`

checklist 输入画像，不直接存展示结果，而是存组合条件。

| 字段名                      | 类型             | 是否必填 | 说明                                   |
| ------------------------ | -------------- | ---- | ------------------------------------ |
| route\_id                | string         | 必填   | 关联路线                                 |
| duration\_bucket         | enum           | 必填   | `half_day / one_day / long_half_day` |
| intensity\_bucket        | enum           | 必填   | `easy / moderate`                    |
| terrain\_tags            | array\[string] | 必填   | 地形特征，如 `stone_step`、`streamside`     |
| weather\_sensitive\_tags | array\[string] | 选填   | 天气敏感标签                               |
| mandatory\_supply\_codes | array\[string] | 必填   | 必带物资                                 |
| optional\_supply\_codes  | array\[string] | 选填   | 可选物资                                 |
| emergency\_supply\_codes | array\[string] | 选填   | 特定条件加严物资                             |
| checklist\_note\_text    | string         | 选填   | 固定提醒                                 |

## 6.10 `route_faq`

FAQ 对象。

| 字段名                 | 类型             | 是否必填 | 说明              |
| ------------------- | -------------- | ---- | --------------- |
| faq\_id             | string         | 必填   | FAQ ID          |
| route\_id           | string         | 必填   | 关联路线            |
| question            | string         | 必填   | FAQ 问题          |
| answer              | string         | 必填   | FAQ 回答          |
| source\_basis       | array\[string] | 必填   | 引用到的结构化字段或证据 ID |
| generated\_by\_ai   | boolean        | 必填   | 是否由 AI 起草       |
| reviewed\_by\_human | boolean        | 必填   | 是否人工审核          |
| display\_order      | integer        | 必填   | 展示顺序            |

## 6.11 `route_source`

证据来源对象。

| 字段名                | 类型             | 是否必填 | 说明                                                    |
| ------------------ | -------------- | ---- | ----------------------------------------------------- |
| source\_id         | string         | 必填   | 来源 ID                                                 |
| route\_id          | string         | 必填   | 关联路线                                                  |
| source\_type       | enum           | 必填   | `official / map / travel_note / video / local_notice` |
| source\_title      | string         | 必填   | 来源标题                                                  |
| source\_url        | string         | 选填   | 来源链接                                                  |
| source\_summary    | string         | 必填   | 来源摘要                                                  |
| credibility\_score | integer        | 必填   | 可信度评分                                                 |
| used\_for\_fields  | array\[string] | 必填   | 被用于支撑哪些字段                                             |
| checked\_at        | datetime       | 必填   | 核验时间                                                  |

## 6.12 `route_user_report`

用户自主上报的关键节点、下撤点、风险点提议对象，不直接进入正式发布层。

| 字段名                | 类型       | 是否必填 | 说明                               |
| ------------------ | -------- | ---- | -------------------------------- |
| report\_id         | string   | 必填   | 上报 ID                            |
| route\_id          | string   | 必填   | 关联路线                             |
| report\_type       | enum     | 必填   | `node / exit_point / risk_point` |
| proposal\_title    | string   | 必填   | 上报标题                             |
| proposal\_point    | point    | 必填   | 提议坐标                             |
| proposal\_text     | string   | 必填   | 上报说明                             |
| screenshot\_url    | string   | 选填   | 截图附件                             |
| report\_status     | enum     | 必填   | `pending / accepted / rejected`  |
| review\_comment    | string   | 选填   | 审核备注                             |
| merged\_target\_id | string   | 选填   | 若已合并，指向正式对象 ID                   |
| created\_at        | datetime | 必填   | 上报时间                             |
| reviewed\_at       | datetime | 选填   | 审核时间                             |

## 6.13 `route_publish_version`

发布版本对象，连接权威数据模型与 route package。

| 字段名                  | 类型       | 是否必填 | 说明                      |
| -------------------- | -------- | ---- | ----------------------- |
| publish\_version\_id | string   | 必填   | 发布版本 ID                 |
| route\_id            | string   | 必填   | 关联路线                    |
| schema\_version      | string   | 必填   | route package schema 版本 |
| content\_version     | integer  | 必填   | 内容版本号                   |
| geometry\_version    | integer  | 必填   | 几何版本号                   |
| faq\_version         | integer  | 必填   | FAQ 版本号                 |
| checklist\_version   | integer  | 必填   | checklist 规则版本号         |
| generated\_at        | datetime | 必填   | 路书包生成时间                 |
| published\_at        | datetime | 必填   | 正式发布时间                  |
| published\_by        | string   | 必填   | 发布人/发布流程                |
| package\_checksum    | string   | 必填   | 包校验值                    |

## 7. 实体关系

```text
route
├── 1 route_geometry
├── n route_stage
├── n route_node
├── n route_exit_point
├── n route_risk_point
├── n route_tag
├── n route_weather_rule
├── 1 route_checklist_profile
├── n route_faq
├── n route_source
├── n route_user_report
└── n route_publish_version
      └── 1 route_package
```

## 8. Route Package 顶层 Schema

## 8.1 顶层结构

```json
{
  "schema_version": "1.0.0",
  "package_type": "route_package",
  "package_id": "pkg_zj-hz-jiuxi-longjing-001_v3",
  "route_id": "zj-hz-jiuxi-longjing-001",
  "publish_version_id": "pub_zj-hz-jiuxi-longjing-001_v3",
  "generated_at": "2026-09-04T16:00:00+08:00",
  "locale": "zh-CN",
  "checksum": "sha256:xxxxx",
  "route_summary": {},
  "navigation": {},
  "prepare": {},
  "weather_policy": {},
  "faq": [],
  "client_hints": {}
}
```

## 8.2 顶层字段说明

| 字段名                  | 是否必填 | 说明                  |
| -------------------- | ---- | ------------------- |
| schema\_version      | 必填   | 包 schema 版本         |
| package\_type        | 必填   | 固定为 `route_package` |
| package\_id          | 必填   | 包唯一标识               |
| route\_id            | 必填   | 路线 ID               |
| publish\_version\_id | 必填   | 发布版本 ID             |
| generated\_at        | 必填   | 生成时间                |
| locale               | 必填   | 当前语言                |
| checksum             | 必填   | 包校验值                |
| route\_summary       | 必填   | 详情/发现页共用摘要          |
| navigation           | 必填   | 在途导航模块              |
| prepare              | 必填   | 出发前准备模块             |
| weather\_policy      | 必填   | 天气与时间规则摘要           |
| faq                  | 选填   | FAQ 集合              |
| client\_hints        | 选填   | 客户端缓存/展示提示          |

## 9. Route Package 子模块 Schema

## 9.1 `route_summary`

```json
{
  "route_name": "九溪到龙井轻徒步",
  "province_name": "浙江",
  "city_name": "杭州",
  "area_name": "西湖区",
  "route_type": "one_way",
  "duration_minutes": 150,
  "distance_km": 6.2,
  "elevation_gain_m": 220,
  "summary_short": "一条看得懂地形、也看得懂自己节奏的茶山溪谷入门线。",
  "beginner_fit_reason": "入口清楚、节奏友好、收手成本低。",
  "easiest_panic_point_text": "中段上行前有看起来更顺的支路，不要继续贴溪走。",
  "exit_logic_summary": "体力明显下降或时间偏晚时，应在中段收手回撤。",
  "tags": [
    { "tag_group": "scenery", "tag_code": "stream_feel", "tag_name": "溪谷感", "is_core": true },
    { "tag_group": "safety", "tag_code": "mature_trail", "tag_name": "成熟步道", "is_core": true },
    { "tag_group": "achievement", "tag_code": "first_try", "tag_name": "首次可尝试", "is_core": true }
  ],
  "cover_image_url": "https://example.com/route-cover.jpg"
}
```

## 9.2 `navigation`

```json
{
  "geometry_version": 3,
  "bounding_box": {
    "min_lng": 120.08,
    "min_lat": 30.20,
    "max_lng": 120.15,
    "max_lat": 30.25
  },
  "start_point": { "lng": 120.101, "lat": 30.221 },
  "end_point": { "lng": 120.143, "lat": 30.244 },
  "overview_center": { "lng": 120.122, "lat": 30.232 },
  "overview_zoom": 13.5,
  "route_polyline": "encoded-polyline-or-geojson",
  "stages": [],
  "key_nodes": [],
  "fork_nodes": [],
  "exit_points": [],
  "risk_points": [],
  "elevation_profile_points": [
    { "distance_m": 0, "altitude_m": 38 },
    { "distance_m": 1200, "altitude_m": 76 },
    { "distance_m": 3200, "altitude_m": 118 }
  ]
}
```

## 9.3 `prepare`

```json
{
  "duration_bucket": "half_day",
  "intensity_bucket": "easy",
  "terrain_tags": ["streamside", "stone_step"],
  "mandatory_supply_codes": ["water", "powerbank", "non_slip_shoes"],
  "optional_supply_codes": ["sun_hat"],
  "emergency_supply_codes": ["light_rain_jacket"],
  "checklist_note_text": "溪谷看起来轻松，不等于沿途一定能补给。"
}
```

## 9.4 `weather_policy`

```json
{
  "weather_rules": [
    {
      "scenario_type": "thunder",
      "severity": "avoid",
      "rule_text": "雷雨预警下不建议出发。",
      "action_text": "取消行程或改为城市近郊平缓路线。"
    },
    {
      "scenario_type": "late_start",
      "severity": "warn",
      "rule_text": "14:30 后不建议继续向上。",
      "action_text": "优先按下撤点回收。"
    }
  ]
}
```

## 9.5 `faq`

```json
[
  {
    "faq_id": "faq_001",
    "question": "如果我走到一半觉得累，还适合继续吗？",
    "answer": "如果你已经明显喘、腿发软，或当前时间晚于建议节点，就应该把收手当成正确动作。",
    "source_basis": ["route.exit_logic_summary", "route.easiest_panic_point_text"],
    "generated_by_ai": true,
    "reviewed_by_human": true
  }
]
```

## 9.6 `client_hints`

```json
{
  "cache_priority": "high",
  "min_supported_client_version": "0.1.0",
  "weak_network_available": true,
  "offline_scope": [
    "route_summary",
    "navigation.route_polyline",
    "navigation.key_nodes",
    "navigation.exit_points",
    "faq"
  ]
}
```

## 10. 页面与包模块映射

| 页面     | 主要读取模块                                         | 说明                        |
| ------ | ---------------------------------------------- | ------------------------- |
| 首页     | 不直接读取整包                                        | 首页读取 route summary 的轻聚合结果 |
| 路线发现页  | `route_summary`                                | 展示路线卡和标签                  |
| 路线详情页  | `route_summary` + `weather_policy` + `faq`     | 详情与解释                     |
| 出发前准备页 | `route_summary` + `prepare` + `weather_policy` | checklist 与出发前判断          |
| 在途导航页  | `navigation` + `weather_policy`                | 路线跟随、关键提示、下撤逻辑            |

## 11. 服务端落地建议

## 11.1 数据库存储建议

- `route`、`route_geometry`、`route_stage`、`route_node`、`route_exit_point`、`route_risk_point` 等对象进入 PostgreSQL；

- `route_polyline` 与空间索引进入 PostGIS；

- `route_faq` 与 `route_source` 可同时进入 pgvector 检索链；

- `route_publish_version` 作为发布记录表；

- `route_package` 可作为：

  - 发布时生成的 JSON 对象存储文件；

  - 或数据库中可回放的发布快照。

## 11.2 发布生成流程

1. 内容编辑完成基础录入；
2. 审核通过后形成 A 级正式结构化模型；
3. 服务端聚合 route 主对象与子对象；
4. 生成 route package；
5. 计算 checksum；
6. 写入 `route_publish_version`；
7. 标记客户端可读取版本。

## 11.3 推荐默认接口分层

- `GET /api/routes`

  - 返回 route summary 轻列表

- `GET /api/routes/:id`

  - 返回详情聚合

- `GET /api/routes/:id/navigation`

  - 返回 navigation 模块

- `GET /api/routes/:id/checklist`

  - 基于 prepare 模块 + 实时天气生成结果

- `GET /api/routes/:id/package`

  - 返回完整 route package

## 12. 校验规则

正式发布前，至少满足以下规则：

1. `route.route_name`、`province_name`、`city_name`、`duration_minutes`、`distance_km`、`elevation_gain_m` 必填；
2. `route.route_logic_summary`、`exit_logic_summary`、`easiest_panic_point_text` 必填；
3. `route_geometry.route_polyline`、`start_point`、`end_point`、`bounding_box` 必填；
4. 至少存在 `1` 个 `key node`；
5. 至少存在 `1` 个 `exit point` 或在 route 主对象中明确只有原路返回逻辑；
6. 至少存在 `1` 条天气或时间规则；
7. FAQ 如存在，必须 `reviewed_by_human = true`；
8. credibility\_level 必须为 `A` 才允许生成正式对外 package。

## 13. 待后续细化但不阻塞当前研发的点

- `route_polyline` 最终采用 GeoJSON 还是 encoded polyline；

- `route_stage` 是否在 MVP 首期就必须显式录入，还是可先由关键节点推导；

- `weather_rule.threshold_config` 的详细阈值表达方式；

- `prepare` 模块与通用物资库的正式表结构；

- 多语言字段是否在 MVP 首期就做 i18n 分层。

## 14. 与旧方案的替代关系

- 本文档中的 `route package` 定义，替代旧方案中模糊的“离线路书包”说法；

- 自本版本起，主干语境中的“路书包”统一指：

  - `结构化发布包`

  - `客户端消费包`

  - `弱网缓存包`

- 不再指向 `docs/archive/deprecated-2026-09-02-image-first-routebook-mvp/` 下的图像优先产物。

