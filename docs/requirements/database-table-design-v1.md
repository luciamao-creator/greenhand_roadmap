# 新手徒步路线库 MVP 数据库表设计 V1

## 1. 文档信息

- 状态：当前生效，待研发评审细化

- 日期：2026-09-04

- 适用范围：PostgreSQL / PostGIS 建库、ORM 建模、迁移脚本设计、后台录入与发布链路实现

- 关联需求：`docs/requirements/mvp-prd-v2.md`

- 关联技术：`docs/decisions/technical-solution-v2.md`

- 关联模型：`docs/requirements/route-data-model-and-route-package-schema-v1.md`

- 关联接口：`docs/requirements/mvp-api-contract-v1.md`

- 上位约束：`SOUL.md`

## 2. 文档目标

- 将当前路线数据模型落成可实施的数据库表结构；

- 定义路线从草稿到发布的核心表关系；

- 明确哪些表属于权威事实层，哪些表属于发布快照层；

- 为后续 ORM、迁移脚本、后台录入和 API 实现提供单一事实来源。

## 3. 设计范围

本文只覆盖 MVP 主干必需表，不覆盖以下内容：

- 用户账号体系；

- 收藏、成就、消息通知；

- 复杂埋点明细仓库；

- 多语言独立翻译表；

- 真正的离线地图瓦片缓存体系。

## 4. 设计原则

### 4.1 分层原则

- `事实层`

  - 人工确认后的路线事实、几何、节点、风险、规则。

- `辅助层`

  - FAQ、证据来源、AI 可解释内容。

- `发布层`

  - 路线发布版本与 route package 快照。

### 4.2 真相优先级

- 几何、节点、下撤点、风险点必须由结构化表提供；

- AI 只能起草摘要、FAQ、解释文案，且必须支持人工覆盖；

- 前台接口优先读取事实层表，必要时再聚合辅助层。

### 4.3 技术基线

- 主数据库：`PostgreSQL`

- 空间扩展：`PostGIS`

- 向量检索：`pgvector`

- 时间字段统一：`timestamptz`

- JSON 扩展字段统一：`jsonb`

## 5. 命名约定

- 主键统一使用 `id`，业务主标识另存 `route_id`、`package_id` 等；

- 审计字段统一使用：

  - `created_at`

  - `updated_at`

  - `created_by`

  - `updated_by`

- 软状态优先于物理删除；

- 枚举优先用 `varchar` + 约束实现，MVP 阶段不强依赖数据库 enum 类型，便于后续演化。

## 6. 核心状态定义

### 6.1 路线状态 `route_status`

- `draft`

- `pending_review`

- `approved`

- `published`

- `paused`

- `retired`

### 6.2 可信度等级 `credibility_level`

- `A`

- `B`

- `C`

### 6.3 发布规则

- 只有 `approved + credibility_level = A` 才允许发布；

- `published` 表示当前至少存在一条有效发布版本；

- `paused` 表示前台不可推荐，但后台保留；

- `retired` 表示不再维护，不对外展示。

## 7. 表总览

### 7.1 事实层

1. `routes`
2. `route_geometries`
3. `route_stages`
4. `route_nodes`
5. `route_exit_points`
6. `route_risk_points`
7. `route_tags`
8. `route_weather_rules`
9. `route_checklist_profiles`

### 7.2 辅助层

1. `route_faqs`
2. `route_sources`
3. `route_user_reports`
4. `supply_items`
5. `checklist_rule_templates`

### 7.3 发布层

1. `route_publish_versions`
2. `route_packages`

### 7.4 运维与治理层

1. `admin_operation_logs`
2. `admin_async_jobs`

## 8. 表关系总图

```text
routes
├── 1 route_geometries
├── n route_stages
├── n route_nodes
├── n route_exit_points
├── n route_risk_points
├── n route_tags
├── n route_weather_rules
├── 1 route_checklist_profiles
├── n route_faqs
├── n route_sources
├── n route_user_reports
└── n route_publish_versions
      └── 1 route_packages

route_checklist_profiles
└── n checklist_rule_templates (逻辑关联，不必须外键)
```

## 9. 表设计明细

## 9.1 `routes`

路线主表，承载路线级权威事实。

### 主要字段

| 字段名                         | 类型           | 约束                     | 说明                                  |
| --------------------------- | ------------ | ---------------------- | ----------------------------------- |
| id                          | bigserial    | PK                     | 自增主键                                |
| route\_id                   | varchar(64)  | UNIQUE NOT NULL        | 业务主 ID，如 `zj-hz-jiuxi-longjing-001` |
| route\_slug                 | varchar(128) | UNIQUE NOT NULL        | 可读 slug                             |
| route\_name                 | varchar(128) | NOT NULL               | 路线名                                 |
| province\_code              | varchar(16)  | NOT NULL               | 省份编码                                |
| province\_name              | varchar(32)  | NOT NULL               | 省份名                                 |
| city\_name                  | varchar(64)  | NOT NULL               | 城市/区域                               |
| area\_name                  | varchar(64)  | NULL                   | 景区/片区                               |
| route\_type                 | varchar(32)  | NOT NULL               | `loop / out_and_back / one_way`     |
| map\_search\_keyword        | varchar(256) | NULL                   | 地图检索关键词，用于草稿创建与地图同步                   |
| route\_status               | varchar(32)  | NOT NULL               | 路线状态                                |
| agent\_prefill\_status      | varchar(16)  | NOT NULL DEFAULT 'pending' | Agent 预填状态                     |
| map\_sync\_status           | varchar(16)  | NOT NULL DEFAULT 'pending' | 地图同步状态                      |
| credibility\_level          | varchar(4)   | NULL                   | `A / B / C`，审核通过前可为空                  |
| beginner\_friendly\_level   | varchar(16)  | NULL                   | `high / medium / low`，草稿阶段可为空      |
| duration\_minutes           | integer      | NULL                   | 建议总时长，默认由 Agent 基于地图结果补全              |
| distance\_km                | numeric(5,1) | NULL                   | 距离，默认由 Agent 基于地图结果补全                 |
| elevation\_gain\_m          | integer      | NULL                   | 累计爬升，默认由 Agent 基于地图结果补全             |
| max\_altitude\_m            | integer      | NULL                   | 最高海拔，可由地图或高程结果补全                  |
| best\_season\_text          | text         | NULL                   | 推荐季节                                |
| start\_point\_name          | varchar(128) | NOT NULL               | 起点名                                 |
| end\_point\_name            | varchar(128) | NOT NULL               | 终点名                                 |
| transport\_summary          | text         | NULL                   | 交通摘要                                |
| route\_logic\_summary       | text         | NULL                   | 路线主逻辑，草稿阶段可为空                        |
| exit\_logic\_summary        | text         | NULL                   | 回撤逻辑，草稿阶段可为空                         |
| easiest\_panic\_point\_text | text         | NULL                   | 最容易慌的点，草稿阶段可为空                       |
| not\_for\_whom\_text        | text         | NULL                   | 什么人先别去，草稿阶段可为空                       |
| summary\_short              | text         | NULL                   | 一句话摘要，草稿阶段可为空                        |
| beginner\_fit\_reason       | text         | NULL                   | 为什么适合新手，草稿阶段可为空                      |
| cover\_image\_url           | text         | NULL                   | 封面图                                 |
| last\_verified\_at          | timestamptz  | NULL                   | 最近核验时间，提交审核前必须补齐                     |
| published\_at               | timestamptz  | NULL                   | 最近正式发布时间                            |
| last\_prefill\_at           | timestamptz  | NULL                   | 最近一次 Agent 预填完成时间                    |
| last\_map\_synced\_at       | timestamptz  | NULL                   | 最近一次地图同步完成时间                          |
| created\_at                 | timestamptz  | NOT NULL DEFAULT now() | 创建时间                                |
| updated\_at                 | timestamptz  | NOT NULL DEFAULT now() | 更新时间                                |
| created\_by                 | varchar(64)  | NULL                   | 创建人                                 |
| updated\_by                 | varchar(64)  | NULL                   | 更新人                                 |

### 推荐索引

- `UNIQUE(route_id)`

- `UNIQUE(route_slug)`

- `INDEX(route_status, credibility_level)`

- `INDEX(province_code, city_name)`

- `INDEX(beginner_friendly_level)`

- `INDEX(route_status, agent_prefill_status, map_sync_status)`

### 约束建议

- `route_status IN ('candidate','draft','pending_review','approved','published','paused','retired')`

- `credibility_level IS NULL OR credibility_level IN ('A','B','C')`

- `agent_prefill_status IN ('pending','running','completed','failed')`

- `map_sync_status IN ('pending','running','completed','failed','missing')`

- `beginner_friendly_level IS NULL OR beginner_friendly_level IN ('high','medium','low')`

- `duration_minutes IS NULL OR duration_minutes > 0`

- `distance_km IS NULL OR distance_km > 0`

- `elevation_gain_m IS NULL OR elevation_gain_m >= 0`

### 说明

- `routes` 主表需要同时承接 `candidate / draft / pending_review / published` 全生命周期，因此草稿阶段尚未补齐的字段允许为空；

- 真正的“必填”约束应在 `submit_review` 与 `publish` 校验中由服务端执行，而不是在建草稿时用数据库 `NOT NULL` 卡死；

- `province_code` 可由服务端在创建草稿时基于 `province_name` 映射生成，不要求运营手填。

## 9.2 `route_geometries`

路线几何主表，承载空间真相。

### 主要字段

| 字段名                        | 类型                         | 约束                                     | 说明      |
| -------------------------- | -------------------------- | -------------------------------------- | ------- |
| id                         | bigserial                  | PK                                     | 主键      |
| route\_id                  | varchar(64)                | UNIQUE NOT NULL FK -> routes.route\_id | 关联路线    |
| geometry\_version          | integer                    | NOT NULL                               | 几何版本号   |
| route\_polyline            | geometry(LineString, 4326) | NOT NULL                               | 推荐路线主轨迹 |
| start\_point               | geometry(Point, 4326)      | NOT NULL                               | 起点坐标    |
| end\_point                 | geometry(Point, 4326)      | NOT NULL                               | 终点坐标    |
| overview\_center           | geometry(Point, 4326)      | NOT NULL                               | 默认中心点   |
| bounding\_box              | geometry(Polygon, 4326)    | NOT NULL                               | 路线范围框   |
| overview\_zoom             | numeric(4,1)               | NULL                                   | 默认缩放    |
| elevation\_profile\_points | jsonb                      | NULL                                   | 海拔剖面采样点 |
| map\_provider\_hint        | varchar(64)                | NULL                                   | 底图提示    |
| source\_provider           | varchar(64)                | NULL                                   | 实际同步来源供应商 |
| synced\_at                 | timestamptz                | NULL                                   | 最近同步时间   |
| created\_at                | timestamptz                | NOT NULL DEFAULT now()                 | 创建时间    |
| updated\_at                | timestamptz                | NOT NULL DEFAULT now()                 | 更新时间    |

### 推荐索引

- `UNIQUE(route_id)`

- `GIST(route_polyline)`

- `GIST(start_point)`

- `GIST(end_point)`

- `GIST(bounding_box)`

### 说明

- 如果 ORM 不便直接管理 `geometry`，可先由迁移脚本创建，业务层仍按结构化字段消费；

- `elevation_profile_points` 可先放 `jsonb`，后续如需精细分析再拆独立表；

- `route_polyline / start_point / end_point / bounding_box` 优先由地图 API / 地图 SDK 同步写入，人工不应主观补造空间真相。

## 9.3 `route_stages`

路线阶段表，用于导航阶段判断与在途文案。

### 主要字段

| 字段名                         | 类型          | 约束                              | 说明                                             |
| --------------------------- | ----------- | ------------------------------- | ---------------------------------------------- |
| id                          | bigserial   | PK                              | 主键                                             |
| stage\_id                   | varchar(64) | UNIQUE NOT NULL                 | 阶段 ID                                          |
| route\_id                   | varchar(64) | NOT NULL FK -> routes.route\_id | 关联路线                                           |
| stage\_order                | integer     | NOT NULL                        | 阶段顺序                                           |
| stage\_name                 | varchar(64) | NOT NULL                        | 阶段名                                            |
| stage\_type                 | varchar(32) | NOT NULL                        | `approach / climb / traverse / descent / exit` |
| start\_node\_id             | varchar(64) | NULL                            | 起点节点 ID                                        |
| end\_node\_id               | varchar(64) | NULL                            | 终点节点 ID                                        |
| stage\_summary              | text        | NOT NULL                        | 本段怎么走                                          |
| expected\_duration\_minutes | integer     | NULL                            | 本段建议时长                                         |
| stage\_risk\_hint           | text        | NULL                            | 本段风险提示                                         |
| created\_at                 | timestamptz | NOT NULL DEFAULT now()          | 创建时间                                           |
| updated\_at                 | timestamptz | NOT NULL DEFAULT now()          | 更新时间                                           |

### 推荐索引

- `UNIQUE(route_id, stage_order)`

- `INDEX(route_id)`

## 9.4 `route_nodes`

路线节点表，统一存关键点、岔路点、提示点。

### 主要字段

| 字段名                      | 类型                    | 约束                              | 说明                                             |
| ------------------------ | --------------------- | ------------------------------- | ---------------------------------------------- |
| id                       | bigserial             | PK                              | 主键                                             |
| node\_id                 | varchar(64)           | UNIQUE NOT NULL                 | 节点 ID                                          |
| route\_id                | varchar(64)           | NOT NULL FK -> routes.route\_id | 关联路线                                           |
| node\_type               | varchar(32)           | NOT NULL                        | `start / end / key / fork / view / checkpoint` |
| node\_name               | varchar(128)          | NOT NULL                        | 节点名称                                           |
| point                    | geometry(Point, 4326) | NOT NULL                        | 节点坐标                                           |
| stage\_order             | integer               | NULL                            | 所属阶段                                           |
| distance\_from\_start\_m | integer               | NULL                            | 距起点累计距离                                        |
| trigger\_radius\_m       | integer               | NOT NULL                        | 触发半径                                           |
| navigation\_hint         | text                  | NOT NULL                        | 接近提示                                           |
| wrong\_choice\_hint      | text                  | NULL                            | 纠偏文案                                           |
| display\_priority        | integer               | NOT NULL DEFAULT 100            | 展示优先级                                          |
| created\_at              | timestamptz           | NOT NULL DEFAULT now()          | 创建时间                                           |
| updated\_at              | timestamptz           | NOT NULL DEFAULT now()          | 更新时间                                           |

### 推荐索引

- `UNIQUE(node_id)`

- `INDEX(route_id, node_type)`

- `INDEX(route_id, stage_order)`

- `GIST(point)`

## 9.5 `route_exit_points`

回撤点表。

### 主要字段

| 字段名                   | 类型                    | 约束                              | 说明                                                 |
| --------------------- | --------------------- | ------------------------------- | -------------------------------------------------- |
| id                    | bigserial             | PK                              | 主键                                                 |
| exit\_point\_id       | varchar(64)           | UNIQUE NOT NULL                 | 下撤点 ID                                             |
| route\_id             | varchar(64)           | NOT NULL FK -> routes.route\_id | 关联路线                                               |
| exit\_name            | varchar(128)          | NOT NULL                        | 下撤点名称                                              |
| point                 | geometry(Point, 4326) | NOT NULL                        | 坐标                                                 |
| stage\_order          | integer               | NULL                            | 所属阶段                                               |
| exit\_type            | varchar(32)           | NOT NULL                        | `return / transport / safe_stop / scenic_turnback` |
| exit\_condition\_text | text                  | NOT NULL                        | 触发条件说明                                             |
| exit\_action\_text    | text                  | NOT NULL                        | 建议动作                                               |
| exit\_priority        | varchar(16)           | NOT NULL                        | `primary / secondary`                              |
| created\_at           | timestamptz           | NOT NULL DEFAULT now()          | 创建时间                                               |
| updated\_at           | timestamptz           | NOT NULL DEFAULT now()          | 更新时间                                               |

### 推荐索引

- `UNIQUE(exit_point_id)`

- `INDEX(route_id, exit_priority)`

- `GIST(point)`

## 9.6 `route_risk_points`

风险点表。

### 主要字段

| 字段名                | 类型                    | 约束                              | 说明                                                                   |
| ------------------ | --------------------- | ------------------------------- | -------------------------------------------------------------------- |
| id                 | bigserial             | PK                              | 主键                                                                   |
| risk\_point\_id    | varchar(64)           | UNIQUE NOT NULL                 | 风险点 ID                                                               |
| route\_id          | varchar(64)           | NOT NULL FK -> routes.route\_id | 关联路线                                                                 |
| risk\_type         | varchar(32)           | NOT NULL                        | `fork_confusion / slippery / exposure / weather / timing / crowding` |
| risk\_level        | varchar(16)           | NOT NULL                        | `low / medium / high`                                                |
| point              | geometry(Point, 4326) | NOT NULL                        | 坐标                                                                   |
| stage\_order       | integer               | NULL                            | 所属阶段                                                                 |
| risk\_title        | varchar(128)          | NOT NULL                        | 风险标题                                                                 |
| risk\_text         | text                  | NOT NULL                        | 风险说明                                                                 |
| safe\_action\_text | text                  | NOT NULL                        | 保守建议                                                                 |
| trigger\_radius\_m | integer               | NOT NULL                        | 触发半径                                                                 |
| created\_at        | timestamptz           | NOT NULL DEFAULT now()          | 创建时间                                                                 |
| updated\_at        | timestamptz           | NOT NULL DEFAULT now()          | 更新时间                                                                 |

### 推荐索引

- `UNIQUE(risk_point_id)`

- `INDEX(route_id, risk_type, risk_level)`

- `GIST(point)`

## 9.7 `route_tags`

路线标签表。

### 主要字段

| 字段名         | 类型          | 约束                              | 说明                               |
| ----------- | ----------- | ------------------------------- | -------------------------------- |
| id          | bigserial   | PK                              | 主键                               |
| route\_id   | varchar(64) | NOT NULL FK -> routes.route\_id | 关联路线                             |
| tag\_group  | varchar(32) | NOT NULL                        | `scenery / safety / achievement` |
| tag\_code   | varchar(64) | NOT NULL                        | 标签编码                             |
| tag\_name   | varchar(64) | NOT NULL                        | 标签名称                             |
| is\_core    | boolean     | NOT NULL DEFAULT false          | 是否核心标签                           |
| sort\_order | integer     | NOT NULL DEFAULT 100            | 排序                               |
| created\_at | timestamptz | NOT NULL DEFAULT now()          | 创建时间                             |
| updated\_at | timestamptz | NOT NULL DEFAULT now()          | 更新时间                             |

### 推荐索引

- `UNIQUE(route_id, tag_code)`

- `INDEX(tag_group, tag_code)`

- `INDEX(route_id, is_core, sort_order)`

## 9.8 `route_weather_rules`

路线天气与时间规则表。

### 主要字段

| 字段名               | 类型          | 约束                              | 说明                                                 |
| ----------------- | ----------- | ------------------------------- | -------------------------------------------------- |
| id                | bigserial   | PK                              | 主键                                                 |
| weather\_rule\_id | varchar(64) | UNIQUE NOT NULL                 | 规则 ID                                              |
| route\_id         | varchar(64) | NOT NULL FK -> routes.route\_id | 关联路线                                               |
| scenario\_type    | varchar(32) | NOT NULL                        | `rain / thunder / heat / cold / wind / late_start` |
| severity          | varchar(16) | NOT NULL                        | `warn / avoid`                                     |
| rule\_text        | text        | NOT NULL                        | 规则说明                                               |
| action\_text      | text        | NOT NULL                        | 建议动作                                               |
| threshold\_config | jsonb       | NULL                            | 阈值配置                                               |
| created\_at       | timestamptz | NOT NULL DEFAULT now()          | 创建时间                                               |
| updated\_at       | timestamptz | NOT NULL DEFAULT now()          | 更新时间                                               |

### 推荐索引

- `UNIQUE(weather_rule_id)`

- `INDEX(route_id, scenario_type, severity)`

## 9.9 `route_checklist_profiles`

checklist 输入画像表。

### 主要字段

| 字段名                      | 类型          | 约束                                     | 说明                                   |
| ------------------------ | ----------- | -------------------------------------- | ------------------------------------ |
| id                       | bigserial   | PK                                     | 主键                                   |
| route\_id                | varchar(64) | UNIQUE NOT NULL FK -> routes.route\_id | 关联路线                                 |
| duration\_bucket         | varchar(32) | NOT NULL                               | `half_day / one_day / long_half_day` |
| intensity\_bucket        | varchar(32) | NOT NULL                               | `easy / moderate`                    |
| terrain\_tags            | jsonb       | NOT NULL                               | 地形标签数组                               |
| weather\_sensitive\_tags | jsonb       | NULL                                   | 天气敏感标签数组                             |
| mandatory\_supply\_codes | jsonb       | NOT NULL                               | 必带物资 code 数组                         |
| optional\_supply\_codes  | jsonb       | NULL                                   | 可选物资 code 数组                         |
| emergency\_supply\_codes | jsonb       | NULL                                   | 加严物资 code 数组                         |
| checklist\_note\_text    | text        | NULL                                   | 固定提醒                                 |
| created\_at              | timestamptz | NOT NULL DEFAULT now()                 | 创建时间                                 |
| updated\_at              | timestamptz | NOT NULL DEFAULT now()                 | 更新时间                                 |

### 说明

- MVP 阶段先用 `jsonb` 存 code 数组，提高录入效率；

- 若后续规则引擎复杂化，再拆中间表。

## 9.10 `route_faqs`

FAQ 表。

### 主要字段

| 字段名                 | 类型           | 约束                              | 说明            |
| ------------------- | ------------ | ------------------------------- | ------------- |
| id                  | bigserial    | PK                              | 主键            |
| faq\_id             | varchar(64)  | UNIQUE NOT NULL                 | FAQ ID        |
| route\_id           | varchar(64)  | NOT NULL FK -> routes.route\_id | 关联路线          |
| question            | text         | NOT NULL                        | 问题            |
| answer              | text         | NOT NULL                        | 回答            |
| source\_basis       | jsonb        | NOT NULL                        | 引用字段或证据 ID 数组 |
| generated\_by\_ai   | boolean      | NOT NULL DEFAULT false          | 是否 AI 起草      |
| reviewed\_by\_human | boolean      | NOT NULL DEFAULT false          | 是否人工审核        |
| display\_order      | integer      | NOT NULL DEFAULT 100            | 展示顺序          |
| embedding           | vector(1536) | NULL                            | 检索向量，维度待按模型调整 |
| created\_at         | timestamptz  | NOT NULL DEFAULT now()          | 创建时间          |
| updated\_at         | timestamptz  | NOT NULL DEFAULT now()          | 更新时间          |

### 推荐索引

- `UNIQUE(faq_id)`

- `INDEX(route_id, reviewed_by_human, display_order)`

- `INDEX USING hnsw (embedding vector_cosine_ops)` 或后续按 pgvector 能力调整

## 9.11 `route_sources`

证据来源表。

### 主要字段

| 字段名                | 类型           | 约束                              | 说明                                                    |
| ------------------ | ------------ | ------------------------------- | ----------------------------------------------------- |
| id                 | bigserial    | PK                              | 主键                                                    |
| source\_id         | varchar(64)  | UNIQUE NOT NULL                 | 来源 ID                                                 |
| route\_id          | varchar(64)  | NOT NULL FK -> routes.route\_id | 关联路线                                                  |
| source\_type       | varchar(32)  | NOT NULL                        | `official / map / travel_note / video / local_notice` |
| source\_title      | varchar(256) | NOT NULL                        | 来源标题                                                  |
| source\_url        | text         | NULL                            | 来源链接                                                  |
| source\_summary    | text         | NOT NULL                        | 来源摘要                                                  |
| credibility\_score | integer      | NOT NULL                        | 可信度评分                                                 |
| used\_for\_fields  | jsonb        | NOT NULL                        | 被支撑字段数组                                               |
| raw\_text\_excerpt | text         | NULL                            | 可选摘要片段                                                |
| embedding          | vector(1536) | NULL                            | 检索向量                                                  |
| checked\_at        | timestamptz  | NOT NULL                        | 核验时间                                                  |
| created\_at        | timestamptz  | NOT NULL DEFAULT now()          | 创建时间                                                  |
| updated\_at        | timestamptz  | NOT NULL DEFAULT now()          | 更新时间                                                  |

### 推荐索引

- `UNIQUE(source_id)`

- `INDEX(route_id, source_type)`

- `INDEX(route_id, credibility_score)`

- `INDEX USING hnsw (embedding vector_cosine_ops)` 或等价方案

## 9.12 `route_user_reports`

用户自主上报的关键节点、下撤点、风险点提议表。

### 主要字段

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | bigserial | PK | 主键 |
| report_id | varchar(64) | UNIQUE NOT NULL | 上报业务 ID |
| route_id | varchar(64) | NOT NULL FK -> routes.route_id | 关联路线 |
| report_type | varchar(32) | NOT NULL | `node / exit_point / risk_point` |
| proposal_title | varchar(128) | NOT NULL | 上报标题 |
| proposal_point | geometry(Point, 4326) | NOT NULL | 提议坐标 |
| proposal_text | text | NOT NULL | 上报说明 |
| screenshot_url | text | NULL | 截图附件 |
| report_status | varchar(16) | NOT NULL DEFAULT 'pending' | `pending / accepted / rejected` |
| review_comment | text | NULL | 审核备注 |
| merged_target_id | varchar(64) | NULL | 若通过，关联正式对象 ID |
| created_at | timestamptz | NOT NULL DEFAULT now() | 上报时间 |
| updated_at | timestamptz | NOT NULL DEFAULT now() | 更新时间 |
| created_by | varchar(64) | NULL | 上报人 |
| updated_by | varchar(64) | NULL | 审核人 |

### 推荐索引

- `UNIQUE(report_id)`

- `INDEX(route_id, report_type, report_status)`

- `GIST(proposal_point)`

## 9.13 `supply_items`

物资库主表。

### 主要字段

| 字段名               | 类型           | 约束                        | 说明                                       |
| ----------------- | ------------ | ------------------------- | ---------------------------------------- |
| id                | bigserial    | PK                        | 主键                                       |
| supply\_code      | varchar(64)  | UNIQUE NOT NULL           | 物资编码                                     |
| supply\_name      | varchar(128) | NOT NULL                  | 物资名                                      |
| supply\_group     | varchar(32)  | NOT NULL                  | `basic / weather / emergency / optional` |
| default\_required | boolean      | NOT NULL DEFAULT false    | 默认是否必带                                   |
| description       | text         | NULL                      | 物资描述                                     |
| status            | varchar(16)  | NOT NULL DEFAULT 'active' | `active / inactive`                      |
| created\_at       | timestamptz  | NOT NULL DEFAULT now()    | 创建时间                                     |
| updated\_at       | timestamptz  | NOT NULL DEFAULT now()    | 更新时间                                     |

### 推荐索引

- `UNIQUE(supply_code)`

- `INDEX(supply_group, status)`

## 9.14 `checklist_rule_templates`

checklist 规则模板表，用于规则引擎。

### 主要字段

| 字段名                           | 类型           | 约束                                        | 说明                                     |
| ----------------------------- | ------------ | ----------------------------------------- | -------------------------------------- |
| id                            | bigserial    | PK                                        | 主键                                     |
| rule\_code                    | varchar(64)  | UNIQUE NOT NULL                           | 规则编码                                   |
| rule\_name                    | varchar(128) | NOT NULL                                  | 规则名                                    |
| applicable\_duration\_bucket  | varchar(32)  | NULL                                      | 适用时长桶                                  |
| applicable\_intensity\_bucket | varchar(32)  | NULL                                      | 适用强度桶                                  |
| applicable\_weather\_scenario | varchar(32)  | NULL                                      | 适用天气场景                                 |
| applicable\_terrain\_tag      | varchar(64)  | NULL                                      | 适用地形标签                                 |
| supply\_code                  | varchar(64)  | NOT NULL FK -> supply\_items.supply\_code | 对应物资                                   |
| required\_level               | varchar(16)  | NOT NULL                                  | `required / recommended / conditional` |
| reason\_template              | text         | NULL                                      | 默认解释模板                                 |
| status                        | varchar(16)  | NOT NULL DEFAULT 'active'                 | 规则状态                                   |
| created\_at                   | timestamptz  | NOT NULL DEFAULT now()                    | 创建时间                                   |
| updated\_at                   | timestamptz  | NOT NULL DEFAULT now()                    | 更新时间                                   |

### 推荐索引

- `UNIQUE(rule_code)`

- `INDEX(applicable_duration_bucket, applicable_intensity_bucket)`

- `INDEX(applicable_weather_scenario, applicable_terrain_tag)`

- `INDEX(supply_code, status)`

## 9.15 `route_publish_versions`

路线发布版本表。

### 主要字段

| 字段名                  | 类型           | 约束                              | 说明                                  |
| -------------------- | ------------ | ------------------------------- | ----------------------------------- |
| id                   | bigserial    | PK                              | 主键                                  |
| publish\_version\_id | varchar(64)  | UNIQUE NOT NULL                 | 发布版本 ID                             |
| route\_id            | varchar(64)  | NOT NULL FK -> routes.route\_id | 关联路线                                |
| schema\_version      | varchar(16)  | NOT NULL                        | route package schema 版本             |
| content\_version     | integer      | NOT NULL                        | 内容版本号                               |
| geometry\_version    | integer      | NOT NULL                        | 几何版本号                               |
| faq\_version         | integer      | NOT NULL                        | FAQ 版本号                             |
| checklist\_version   | integer      | NOT NULL                        | checklist 版本号                       |
| publish\_status      | varchar(16)  | NOT NULL DEFAULT 'published'    | `published / rolled_back / invalid` |
| generated\_at        | timestamptz  | NOT NULL                        | 生成时间                                |
| published\_at        | timestamptz  | NOT NULL                        | 发布时间                                |
| published\_by        | varchar(64)  | NULL                            | 发布人                                 |
| package\_checksum    | varchar(128) | NOT NULL                        | 包校验值                                |
| created\_at          | timestamptz  | NOT NULL DEFAULT now()          | 创建时间                                |

### 推荐索引

- `UNIQUE(publish_version_id)`

- `INDEX(route_id, published_at DESC)`

- `INDEX(route_id, publish_status)`

### 说明

- 一个路线可以有多条发布版本；

- 当前生效版本由服务端按 `publish_status='published'` 且最新时间选择，或由路由策略表后续增强。

## 9.16 `route_packages`

路线发布包快照表。

### 主要字段

| 字段名                      | 类型           | 约束                                                                  | 说明                  |
| ------------------------ | ------------ | ------------------------------------------------------------------- | ------------------- |
| id                       | bigserial    | PK                                                                  | 主键                  |
| package\_id              | varchar(64)  | UNIQUE NOT NULL                                                     | 包 ID                |
| publish\_version\_id     | varchar(64)  | UNIQUE NOT NULL FK -> route\_publish\_versions.publish\_version\_id | 关联发布版本              |
| route\_id                | varchar(64)  | NOT NULL FK -> routes.route\_id                                     | 冗余路线 ID，便于查询        |
| package\_schema\_version | varchar(16)  | NOT NULL                                                            | 包 schema 版本         |
| package\_json            | jsonb        | NOT NULL                                                            | 完整 route package 快照 |
| package\_size\_bytes     | integer      | NULL                                                                | 包大小                 |
| checksum                 | varchar(128) | NOT NULL                                                            | 校验值                 |
| created\_at              | timestamptz  | NOT NULL DEFAULT now()                                              | 创建时间                |

### 推荐索引

- `UNIQUE(package_id)`

- `UNIQUE(publish_version_id)`

- `INDEX(route_id, created_at DESC)`

- `GIN(package_json)`

### 说明

- 这里存的是已发布快照，不是事实表；

- 前台 `/api/routes/:id/package` 可直接从此表读取当前版本。

## 9.17 `admin_operation_logs`

后台操作日志表。

### 主要字段

| 字段名              | 类型           | 约束                     | 说明                                                                         |
| ---------------- | ------------ | ---------------------- | -------------------------------------------------------------------------- |
| id               | bigserial    | PK                     | 主键                                                                         |
| operator\_id     | varchar(64)  | NULL                   | 操作人                                                                        |
| operator\_name   | varchar(128) | NULL                   | 操作人名称                                                                      |
| action\_type     | varchar(64)  | NOT NULL               | `create_route / update_route / review_route / publish_route / pause_route` |
| target\_type     | varchar(64)  | NOT NULL               | 目标类型，如 `route`                                                             |
| target\_id       | varchar(64)  | NOT NULL               | 目标业务 ID                                                                    |
| before\_snapshot | jsonb        | NULL                   | 操作前快照                                                                      |
| after\_snapshot  | jsonb        | NULL                   | 操作后快照                                                                      |
| comment          | text         | NULL                   | 备注                                                                         |
| created\_at      | timestamptz  | NOT NULL DEFAULT now() | 操作时间                                                                       |

### 推荐索引

- `INDEX(target_type, target_id, created_at DESC)`

- `INDEX(operator_id, created_at DESC)`

- `INDEX(action_type, created_at DESC)`

## 9.18 `admin_async_jobs`

后台异步任务表，用于承接 Agent 预填、地图同步、发布预览与正式发布组装等任务。

### 主要字段

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | bigserial | PK | 主键 |
| job_id | varchar(64) | UNIQUE NOT NULL | 任务业务 ID |
| job_type | varchar(32) | NOT NULL | `agent_prefill / map_sync / publish_preview / publish_package` |
| route_id | varchar(64) | NOT NULL FK -> routes.route_id | 关联路线 |
| job_status | varchar(16) | NOT NULL DEFAULT 'pending' | `pending / running / succeeded / failed / cancelled` |
| payload_json | jsonb | NULL | 任务载荷 |
| result_json | jsonb | NULL | 结果摘要 |
| retry_count | integer | NOT NULL DEFAULT 0 | 重试次数 |
| error_message | text | NULL | 错误摘要 |
| created_at | timestamptz | NOT NULL DEFAULT now() | 创建时间 |
| started_at | timestamptz | NULL | 开始执行时间 |
| finished_at | timestamptz | NULL | 执行结束时间 |
| created_by | varchar(64) | NULL | 发起人 |

### 推荐索引

- `INDEX(route_id, created_at DESC)`

- `INDEX(job_type, job_status, created_at DESC)`

- `INDEX(job_status, created_at DESC)`

### 说明

- 该表属于实现支撑层，不作为前台消费真相来源；

- 同一 `route_id + job_type` 在 `running` 状态时，服务端应避免重复创建任务；

- 任务结果应同步回写 `routes.agent_prefill_status` 或地图同步状态字段，避免前端直接依赖任务表字段。

## 10. 必要外键与删除策略

### 10.1 外键建议

- 所有子表通过 `route_id` 外键关联 `routes.route_id`

- `route_packages.publish_version_id` 外键关联 `route_publish_versions.publish_version_id`

- `checklist_rule_templates.supply_code` 外键关联 `supply_items.supply_code`

### 10.2 删除策略

- MVP 不建议物理删除路线；

- `routes` 主记录应通过 `route_status` 控制生命周期；

- 子表原则上采用：

  - 路线不存在时 `RESTRICT`

  - 后台明确执行清理脚本时再做物理删除

## 11. 路线正式入库流程对应到表

### 11.1 候选录入

- 写入 `routes`

- 同步补充：

  - `route_geometries`

  - `route_nodes`

  - `route_exit_points`

  - `route_risk_points`

  - `route_tags`

  - `route_weather_rules`

  - `route_checklist_profiles`

  - `route_sources`

### 11.2 FAQ 与解释补齐

- 写入 `route_faqs`

- 如启用 embedding，则同步写 `embedding`

### 11.3 审核通过

- 更新 `routes.route_status = approved`

- 更新 `routes.credibility_level = A`

- 写操作日志到 `admin_operation_logs`

### 11.4 正式发布

- 生成 `route_publish_versions`

- 生成 `route_packages`

- 更新 `routes.route_status = published`

- 回写 `routes.published_at`

## 12. MVP 阶段可接受的简化

- `route_checklist_profiles` 中的 code 数组先用 `jsonb`，不强拆多张关联表；

- `embedding` 字段可以先预留，首版不强制全量回填；

- `admin_operation_logs` 可先只记录关键动作，不追求全字段 diff；

- `route_packages` 可先以数据库 `jsonb` 为主，后续再补对象存储镜像。

## 13. 不建议现在过度设计的点

- 不要现在就拆几十张标签维表；

- 不要现在就为多语言做全套翻译子表；

- 不要现在就做复杂版本对比表；

- 不要现在就做精细化实时轨迹回放表；

- 不要现在就做用户轨迹历史仓库。

## 14. 待后续细化但不阻塞当前研发的点

- ORM 最终选型后字段类型映射细节；

- `geometry` 字段是否由应用层同步存一份 encoded polyline；

- `embedding` 维度是否与最终模型保持一致；

- 发布层是否需要增加“当前生效版本”标记表；

- 后台账号与权限表何时正式引入。

## 15. 与主干文档关系

- 本文档是当前数据库表设计权威来源；

- 字段语义以上游 `route-data-model-and-route-package-schema-v1.md` 为准；

- 接口输出以上游 `mvp-api-contract-v1.md` 为准；

- 若后续字段新增或改名，必须先更新模型文档和本表设计文档，再改迁移脚本与业务代码。
