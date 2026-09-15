# 新手徒步路线库 MVP 后台录入与审核字段清单 V1

## 1. 文档信息

- 状态：当前生效，待研发评审细化

- 日期：2026-09-04

- 适用范围：后台表单设计、前后端联调、内容录入 SOP、审核清单、发布校验

- 关联页面：`docs/requirements/admin-route-ingestion-and-review-page-design-v1.md`

- 关联候选池：`docs/requirements/first-launch-30-route-candidate-pool-v1.md`

- 关联字段：`docs/requirements/page-level-field-spec-v1.md`

- 关联数据：`docs/requirements/route-data-model-and-route-package-schema-v1.md`

- 关联表设计：`docs/requirements/database-table-design-v1.md`

- 上位约束：`SOUL.md`

## 2. 文档目标

- 将后台页面设计继续压实到字段级；

- 明确每个字段的：

  - 字段名

  - 页面归属

  - 是否必填

  - 数据表归属

  - 是否允许 AI 起草

  - 审核要求

- 确保后台录入字段、数据库表字段、前台消费字段之间一一对应，不再靠口头理解。

## 3. 字段治理原则

### 3.1 真相优先级

- 第一优先：地图 API / 地图 SDK 同步后的结构化事实，以及人工审核通过后的结构化事实；

- 第二优先：天气/规则引擎结果；

- 第三优先：AI 解释文案；

- 第四优先：自由备注。

### 3.2 AI 边界

- `允许 AI 起草或补全`

  - 一句话摘要；

  - 为什么适合新手；

  - FAQ 回答；

  - checklist 推荐原因；

  - 距离 / 时长 / 爬升等基础参数草稿；

  - 证据来源草稿与来源摘要；

  - 标签候选。

- `不允许 AI 直接定稿`

  - 地图 API 中不存在的起终点真相；

  - 几何轨迹；

  - 未经审核的关键节点；

  - 未经审核的下撤点；

  - 未经审核的风险点；

  - 天气原始事实；

  - 准入与淘汰结论。

### 3.3 新增路线最小录入原则

- 运营新增路线时，默认只录入 `最小事实包`，不要求一次性填完整路线；

- 距离 / 时长 / 爬升 / 证据来源 / FAQ / 标签候选默认由 Agent 先补全草稿；

- 若地图 API 没有给出可用空间真相，则该部分保持缺失，不允许人工凭感觉补“地图真相”；

- 关键节点、下撤点、风险点允许用户自主上报，但必须进入待审核状态后才能进入正式事实表。

### 3.4 字段状态定义

- `必填`

  - 缺失时不得提交审核或不得发布。

- `选填`

  - 可缺省，但会影响页面完整度。

- `可降级`

  - 前台模块可隐藏或退回简化展示。

## 4. 字段分组总览

后台字段按以下分组组织：

1. 候选池字段
2. 路线基础事实字段
3. 路线标签字段
4. 几何与导航字段
5. 风险、天气与 checklist 字段
6. 证据来源与 FAQ 字段
7. 审核字段
8. 发布字段

## 5. AD01 候选池列表页字段

## 5.1 说明

- 该页承接 `首发 30 条路线候选池 V1`；

- 字段不要求一次性全都落正式主表，但至少要能稳定表达候选状态与录入优先级。

## 5.2 新增路线最小录入字段

该组字段用于“未来运营主动新增一条新路线”时的最小创建弹窗，而不是首发 30 条候选池导入场景。

| 字段名                    | 中文说明       | 是否必填 | 表/来源                      | 是否允许 AI 起草 | 审核要求                                     |
| ---------------------- | ---------- | ---- | ------------------------- | ---------- | ---------------------------------------- |
| route\_name            | 路线名        | 必填   | `routes.route_name`       | 否          | 作为草稿主标识                                  |
| province\_name         | 省份         | 必填   | `routes.province_name`    | 否          | 必须属于当前支持省份                               |
| city\_name             | 城市/区域      | 必填   | `routes.city_name`        | 否          | 对运营可理解                                   |
| area\_name             | 景区/片区      | 选填   | `routes.area_name`        | 否          | 推荐填写                                     |
| start\_point\_name     | 起点名称       | 必填   | `routes.start_point_name` | 否          | 可用于地图 API 检索                             |
| end\_point\_name       | 终点名称       | 必填   | `routes.end_point_name`   | 否          | 往返线可与起点相同                                |
| route\_type            | 路线类型       | 必填   | `routes.route_type`       | 否          | `loop / out_and_back / one_way`          |
| map\_search\_keyword   | 地图检索关键词    | 选填   | 扩展字段                      | 否          | 推荐给 Agent 补全用                            |
| agent\_prefill\_status | Agent 预填状态 | 必填   | 后台状态字段                    | 否          | `pending / running / completed / failed` |

补充约束：

- 新建草稿时不要求运营手填 `distance_km / duration_minutes / elevation_gain_m`；

- 新建草稿时不要求运营手填 `candidate_reason_summary`；

- 新建草稿时不要求运营手填证据来源链接。

| 字段名                             | 中文说明         | 是否必填 | 表/来源                       | 是否允许 AI 起草 | 审核要求                                                        |
| ------------------------------- | ------------ | ---- | -------------------------- | ---------- | ----------------------------------------------------------- |
| candidate\_route\_name          | 候选路线名        | 必填   | `routes.route_name` 或候选导入源 | 否          | 必须与对外名称一致                                                   |
| candidate\_province\_name       | 省份           | 必填   | `routes.province_name`     | 否          | 必须属于当前首发四省                                                  |
| candidate\_city\_name           | 城市/区域        | 必填   | `routes.city_name`         | 否          | 城市粒度要可理解                                                    |
| candidate\_tier                 | 候选层级 `A1/A2` | 必填   | 候选池导入字段                    | 否          | 只能二选一                                                       |
| candidate\_beginner\_fit\_level | 新手适配度        | 必填   | 候选池导入字段                    | 否          | `高/中高/中` 三档即可                                               |
| candidate\_reason\_summary      | 初步入选理由       | 必填   | 候选池导入字段                    | 否          | 不能只写“很火”                                                    |
| candidate\_risk\_note           | 风险备注         | 必填   | 候选池导入字段                    | 否          | 必须至少写 1 条风险提醒                                               |
| candidate\_status               | 当前建议状态       | 必填   | 候选池导入字段                    | 否          | `建议优先录入 / 候补补证据 / 淘汰`                                       |
| work\_status                    | 当前工作状态       | 必填   | 后台状态字段                     | 否          | `candidate / draft / pending_review / approved / published` |
| priority\_flag                  | 是否优先录入       | 选填   | 后台状态字段                     | 否          | 可用布尔值                                                       |
| candidate\_owner                | 当前负责人        | 选填   | 后台状态字段                     | 否          | MVP 可为空                                                     |
| candidate\_note                 | 候选备注         | 选填   | 操作日志或扩展字段                  | 否          | 不得替代正式风险字段                                                  |

## 6. AD03 基础事实录入页字段

## 6.1 路线身份字段

| 字段名            | 中文说明    | 是否必填 | 表字段                    | 是否允许 AI 起草 | 审核要求                            |
| -------------- | ------- | ---- | ---------------------- | ---------- | ------------------------------- |
| route\_id      | 路线业务 ID | 必填   | `routes.route_id`      | 否          | 系统生成，不人工手填                      |
| route\_slug    | 路线路由标识  | 必填   | `routes.route_slug`    | 否          | 需唯一、可读                          |
| route\_name    | 路线名     | 必填   | `routes.route_name`    | 否          | 必须与候选池一致或记录改名原因                 |
| province\_code | 省份编码    | 必填   | `routes.province_code` | 否          | 必须符合四省编码规则                      |
| province\_name | 省份名     | 必填   | `routes.province_name` | 否          | <br />                          |
| city\_name     | 城市/区域   | 必填   | `routes.city_name`     | 否          | 对用户可理解                          |
| area\_name     | 景区/片区   | 选填   | `routes.area_name`     | 否          | 推荐填写，便于发现页聚合                    |
| route\_type    | 路线类型    | 必填   | `routes.route_type`    | 否          | `loop / out_and_back / one_way` |

## 6.2 基本参数字段

| 字段名                | 中文说明  | 是否必填 | 表字段                       | 是否允许 AI 起草 | 审核要求                                |
| ------------------ | ----- | ---- | ------------------------- | ---------- | ----------------------------------- |
| duration\_minutes  | 建议总时长 | 必填   | `routes.duration_minutes` | 是          | 默认由 Agent 基于地图 API / 路径结果补全，人工确认后生效 |
| distance\_km       | 距离    | 必填   | `routes.distance_km`      | 是          | 默认由 Agent 补全，审核前需人工确认               |
| elevation\_gain\_m | 累计爬升  | 必填   | `routes.elevation_gain_m` | 是          | 默认由 Agent 补全，不得手工拍脑袋估值              |
| max\_altitude\_m   | 最高海拔  | 选填   | `routes.max_altitude_m`   | 是          | 有则由地图或高程结果补全                        |
| best\_season\_text | 推荐季节  | 选填   | `routes.best_season_text` | 否          | 推荐按季节+天气条件描述                        |

## 6.3 新手判断字段

| 字段名                         | 中文说明    | 是否必填 | 表字段                               | 是否允许 AI 起草 | 审核要求                  |
| --------------------------- | ------- | ---- | --------------------------------- | ---------- | --------------------- |
| summary\_short              | 一句话摘要   | 必填   | `routes.summary_short`            | 是          | AI 起草后必须人工审核          |
| beginner\_fit\_reason       | 为什么适合新手 | 必填   | `routes.beginner_fit_reason`      | 是          | 不得出现夸大承诺              |
| not\_for\_whom\_text        | 什么人先别去  | 必填   | `routes.not_for_whom_text`        | 否          | 必须明确边界人群              |
| easiest\_panic\_point\_text | 最容易慌的点  | 必填   | `routes.easiest_panic_point_text` | 否          | 必须与节点/风险页一致           |
| exit\_logic\_summary        | 回撤逻辑摘要  | 必填   | `routes.exit_logic_summary`       | 否          | 必须与下撤点结构一致            |
| route\_logic\_summary       | 主路径逻辑摘要 | 必填   | `routes.route_logic_summary`      | 否          | 不能依赖手绘解释才看得懂          |
| beginner\_friendly\_level   | 新手友好等级  | 必填   | `routes.beginner_friendly_level`  | 否          | `high / medium / low` |

## 6.4 交通与入口字段

| 字段名                | 中文说明   | 是否必填 | 表字段                        | 是否允许 AI 起草 | 审核要求          |
| ------------------ | ------ | ---- | -------------------------- | ---------- | ------------- |
| start\_point\_name | 起点名称   | 必填   | `routes.start_point_name`  | 否          | 必须可公开搜索定位     |
| end\_point\_name   | 终点名称   | 必填   | `routes.end_point_name`    | 否          | 往返线可与起点相同     |
| transport\_summary | 交通摘要   | 选填   | `routes.transport_summary` | 否          | 推荐填公交/停车/接驳信息 |
| cover\_image\_url  | 封面图链接  | 选填   | `routes.cover_image_url`   | 否          | 为空允许降级        |
| last\_verified\_at | 最近核验时间 | 必填   | `routes.last_verified_at`  | 否          | 未核验不得提交审核     |

## 6.5 路线标签字段

| 字段名         | 中文说明   | 是否必填 | 表字段                     | 是否允许 AI 起草 | 审核要求                |
| ----------- | ------ | ---- | ----------------------- | ---------- | ------------------- |
| tag\_group  | 标签分组   | 必填   | `route_tags.tag_group`  | 是          | Agent 可先给候选，人工确认后生效 |
| tag\_code   | 标签编码   | 必填   | `route_tags.tag_code`   | 是          | 同一路线下必须唯一           |
| tag\_name   | 标签名称   | 必填   | `route_tags.tag_name`   | 是          | 对用户可理解，避免内部黑话       |
| is\_core    | 是否核心标签 | 必填   | `route_tags.is_core`    | 是          | 全路线建议 1-3 个核心标签     |
| sort\_order | 排序     | 选填   | `route_tags.sort_order` | 否          | 默认 100，核心标签应优先展示    |

补充约束：

- 至少存在 1 个 `safety` 标签；

- 至少存在 1 个核心标签；

- 发现页与详情页展示标签必须从该结构化表读取，不允许写死在自由备注里。

## 7. AD04 几何、节点与导航录入页字段

## 7.1 几何字段

| 字段名                        | 中文说明     | 是否必填 | 表字段                                         | 是否允许 AI 起草 | 审核要求        |
| -------------------------- | -------- | ---- | ------------------------------------------- | ---------- | ----------- |
| geometry\_version          | 几何版本号    | 必填   | `route_geometries.geometry_version`         | 否          | 每次调整需递增     |
| route\_polyline            | 推荐路线轨迹   | 必填   | `route_geometries.route_polyline`           | 否          | 必须可在地图上完整预览 |
| start\_point               | 起点坐标     | 必填   | `route_geometries.start_point`              | 否          | 必须与起点名称一致   |
| end\_point                 | 终点坐标     | 必填   | `route_geometries.end_point`                | 否          | 必须与终点名称一致   |
| overview\_center           | 详情页默认中心点 | 必填   | `route_geometries.overview_center`          | 否          | 不得偏离主线      |
| bounding\_box              | 路线范围框    | 必填   | `route_geometries.bounding_box`             | 否          | 自动生成或人工确认   |
| overview\_zoom             | 默认缩放     | 选填   | `route_geometries.overview_zoom`            | 否          | 推荐填写        |
| elevation\_profile\_points | 海拔剖面采样点  | 选填   | `route_geometries.elevation_profile_points` | 否          | 如暂无可先为空     |
| map\_provider\_hint        | 底图提示     | 选填   | `route_geometries.map_provider_hint`        | 否          | 后端/客户端消费提示  |

补充约束：

- 主轨迹、起终点、范围框优先由地图 API 或地图 SDK 同步结果生成；

- 若地图 API 未返回可用结果，不允许以自由备注代替空间真相；

- 人工职责是审核和纠错，不是凭主观生成地图真相。

## 7.2 阶段字段

| 字段名                         | 中文说明   | 是否必填 | 表字段                                      | 是否允许 AI 起草 | 审核要求       |
| --------------------------- | ------ | ---- | ---------------------------------------- | ---------- | ---------- |
| stage\_id                   | 阶段 ID  | 必填   | `route_stages.stage_id`                  | 否          | 唯一         |
| stage\_order                | 阶段顺序   | 必填   | `route_stages.stage_order`               | 否          | 连续递增       |
| stage\_name                 | 阶段名称   | 必填   | `route_stages.stage_name`                | 否          | 对用户可理解     |
| stage\_type                 | 阶段类型   | 必填   | `route_stages.stage_type`                | 否          | 枚举值合法      |
| start\_node\_id             | 阶段起点节点 | 选填   | `route_stages.start_node_id`             | 否          | 推荐填写       |
| end\_node\_id               | 阶段终点节点 | 选填   | `route_stages.end_node_id`               | 否          | 推荐填写       |
| stage\_summary              | 本段怎么走  | 必填   | `route_stages.stage_summary`             | 否          | 不能过度依赖专业术语 |
| expected\_duration\_minutes | 本段建议时长 | 选填   | `route_stages.expected_duration_minutes` | 否          | <br />     |
| stage\_risk\_hint           | 本段风险提示 | 选填   | `route_stages.stage_risk_hint`           | 否          | 与风险点字段保持一致 |

## 7.3 节点字段

| 字段名                      | 中文说明    | 是否必填 | 表字段                                 | 是否允许 AI 起草 | 审核要求                                           |
| ------------------------ | ------- | ---- | ----------------------------------- | ---------- | ---------------------------------------------- |
| node\_id                 | 节点 ID   | 必填   | `route_nodes.node_id`               | 否          | 唯一                                             |
| node\_type               | 节点类型    | 必填   | `route_nodes.node_type`             | 否          | `start / end / key / fork / view / checkpoint` |
| node\_name               | 节点名称    | 必填   | `route_nodes.node_name`             | 否          | 可识别、可讲解                                        |
| point                    | 节点坐标    | 必填   | `route_nodes.point`                 | 否          | 必须落在主线合理范围内                                    |
| stage\_order             | 所属阶段    | 选填   | `route_nodes.stage_order`           | 否          | 推荐填写                                           |
| distance\_from\_start\_m | 距起点累计距离 | 选填   | `route_nodes.distance_from_start_m` | 否          | 有利于导航                                          |
| trigger\_radius\_m       | 触发半径    | 必填   | `route_nodes.trigger_radius_m`      | 否          | 不得为 0                                          |
| navigation\_hint         | 接近提示    | 必填   | `route_nodes.navigation_hint`       | 否          | 新手看得懂                                          |
| wrong\_choice\_hint      | 纠偏提示    | 选填   | `route_nodes.wrong_choice_hint`     | 否          | 岔路点推荐填写                                        |
| display\_priority        | 展示优先级   | 选填   | `route_nodes.display_priority`      | 否          | 默认 100                                         |

## 7.4 下撤点字段

| 字段名                   | 中文说明   | 是否必填 | 表字段                                     | 是否允许 AI 起草 | 审核要求                  |
| --------------------- | ------ | ---- | --------------------------------------- | ---------- | --------------------- |
| exit\_point\_id       | 下撤点 ID | 必填   | `route_exit_points.exit_point_id`       | 否          | 唯一                    |
| exit\_name            | 下撤点名称  | 必填   | `route_exit_points.exit_name`           | 否          | 应为可识别地点               |
| point                 | 下撤点坐标  | 必填   | `route_exit_points.point`               | 否          | 不得缺失                  |
| stage\_order          | 所属阶段   | 选填   | `route_exit_points.stage_order`         | 否          | 推荐填写                  |
| exit\_type            | 下撤类型   | 必填   | `route_exit_points.exit_type`           | 否          | 枚举合法                  |
| exit\_condition\_text | 触发条件说明 | 必填   | `route_exit_points.exit_condition_text` | 否          | 必须具体                  |
| exit\_action\_text    | 建议动作   | 必填   | `route_exit_points.exit_action_text`    | 否          | 要有明确动作                |
| exit\_priority        | 优先级    | 必填   | `route_exit_points.exit_priority`       | 否          | `primary / secondary` |

## 8. AD05 风险、天气与 checklist 录入页字段

## 8.1 风险点字段

| 字段名                | 中文说明   | 是否必填 | 表字段                                  | 是否允许 AI 起草 | 审核要求                 |
| ------------------ | ------ | ---- | ------------------------------------ | ---------- | -------------------- |
| risk\_point\_id    | 风险点 ID | 必填   | `route_risk_points.risk_point_id`    | 否          | 唯一                   |
| risk\_type         | 风险类型   | 必填   | `route_risk_points.risk_type`        | 否          | 枚举合法                 |
| risk\_level        | 风险等级   | 必填   | `route_risk_points.risk_level`       | 否          | 至少 `low/medium/high` |
| point              | 风险点坐标  | 必填   | `route_risk_points.point`            | 否          | 与主线和节点相关             |
| stage\_order       | 所属阶段   | 选填   | `route_risk_points.stage_order`      | 否          | 推荐填写                 |
| risk\_title        | 风险标题   | 必填   | `route_risk_points.risk_title`       | 否          | 不得写得过泛               |
| risk\_text         | 风险说明   | 必填   | `route_risk_points.risk_text`        | 否          | 应讲清为何危险              |
| safe\_action\_text | 保守建议   | 必填   | `route_risk_points.safe_action_text` | 否          | 必须给动作建议              |
| trigger\_radius\_m | 触发半径   | 必填   | `route_risk_points.trigger_radius_m` | 否          | 不得为 0                |

## 8.2 天气与时间规则字段

| 字段名               | 中文说明  | 是否必填 | 表字段                                    | 是否允许 AI 起草 | 审核要求                                               |
| ----------------- | ----- | ---- | -------------------------------------- | ---------- | -------------------------------------------------- |
| weather\_rule\_id | 规则 ID | 必填   | `route_weather_rules.weather_rule_id`  | 否          | 唯一                                                 |
| scenario\_type    | 场景类型  | 必填   | `route_weather_rules.scenario_type`    | 否          | `rain / thunder / heat / cold / wind / late_start` |
| severity          | 严重程度  | 必填   | `route_weather_rules.severity`         | 否          | `warn / avoid`                                     |
| rule\_text        | 规则说明  | 必填   | `route_weather_rules.rule_text`        | 否          | 不能只写“注意安全”                                         |
| action\_text      | 建议动作  | 必填   | `route_weather_rules.action_text`      | 否          | 要有清晰动作                                             |
| threshold\_config | 阈值配置  | 选填   | `route_weather_rules.threshold_config` | 否          | 后端规则引擎使用                                           |

## 8.3 checklist 画像字段

| 字段名                      | 中文说明   | 是否必填 | 表字段                                               | 是否允许 AI 起草 | 审核要求     |
| ------------------------ | ------ | ---- | ------------------------------------------------- | ---------- | -------- |
| duration\_bucket         | 时长桶    | 必填   | `route_checklist_profiles.duration_bucket`        | 否          | 枚举合法     |
| intensity\_bucket        | 强度桶    | 必填   | `route_checklist_profiles.intensity_bucket`       | 否          | 枚举合法     |
| terrain\_tags            | 地形标签数组 | 必填   | `route_checklist_profiles.terrain_tags`           | 否          | 至少 1 个标签 |
| weather\_sensitive\_tags | 天气敏感标签 | 选填   | `route_checklist_profiles.weather_sensitive_tags` | 否          | <br />   |
| mandatory\_supply\_codes | 必带物资编码 | 必填   | `route_checklist_profiles.mandatory_supply_codes` | 否          | 至少 1 个   |
| optional\_supply\_codes  | 可选物资编码 | 选填   | `route_checklist_profiles.optional_supply_codes`  | 否          | <br />   |
| emergency\_supply\_codes | 加严物资编码 | 选填   | `route_checklist_profiles.emergency_supply_codes` | 否          | <br />   |
| checklist\_note\_text    | 固定提醒   | 选填   | `route_checklist_profiles.checklist_note_text`    | 否          | 推荐填写     |

## 8.4 用户上报待审核字段

该组字段不直接进入前台消费，而是在 AD02 工作台、AD04 几何页、AD05 风险页中作为“待审核提议”存在。

| 字段名                | 中文说明       | 是否必填  | 表字段                                   | 是否允许 AI 起草 | 审核要求                             |
| ------------------ | ---------- | ----- | ------------------------------------- | ---------- | -------------------------------- |
| report\_id         | 上报 ID      | 必填    | `route_user_reports.report_id`        | 否          | 唯一                               |
| report\_type       | 上报类型       | 必填    | `route_user_reports.report_type`      | 否          | `node / exit_point / risk_point` |
| proposal\_title    | 上报标题       | 必填    | `route_user_reports.proposal_title`   | 否          | 对审核员可理解                          |
| proposal\_point    | 上报坐标       | 必填    | `route_user_reports.proposal_point`   | 否          | 必须可落点到地图                         |
| proposal\_text     | 上报说明       | 必填    | `route_user_reports.proposal_text`    | 否          | 必须说明为什么要补这个点                     |
| screenshot\_url    | 附件截图       | 选填    | `route_user_reports.screenshot_url`   | 否          | 可为空                              |
| report\_status     | 审核状态       | 必填    | `route_user_reports.report_status`    | 否          | `pending / accepted / rejected`  |
| review\_comment    | 审核备注       | 拒绝时必填 | `route_user_reports.review_comment`   | 否          | 不得写空话                            |
| merged\_target\_id | 合并到正式对象 ID | 通过时选填 | `route_user_reports.merged_target_id` | 否          | 通过后应能追溯到正式节点/下撤点/风险点             |

## 9. AD06 证据来源与 FAQ 页字段

## 9.1 证据来源字段

| 字段名                | 中文说明   | 是否必填 | 表字段                               | 是否允许 AI 起草 | 审核要求                                                  |
| ------------------ | ------ | ---- | --------------------------------- | ---------- | ----------------------------------------------------- |
| source\_id         | 来源 ID  | 必填   | `route_sources.source_id`         | 否          | 唯一                                                    |
| source\_type       | 来源类型   | 必填   | `route_sources.source_type`       | 否          | `official / map / travel_note / video / local_notice` |
| source\_title      | 来源标题   | 必填   | `route_sources.source_title`      | 否          | 不得空泛                                                  |
| source\_url        | 来源链接   | 选填   | `route_sources.source_url`        | 否          | 推荐填写                                                  |
| source\_summary    | 来源摘要   | 必填   | `route_sources.source_summary`    | 是          | 可由 Agent 先生成摘要，人工确认后保留                                |
| credibility\_score | 可信度评分  | 必填   | `route_sources.credibility_score` | 否          | 推荐 1-100                                              |
| used\_for\_fields  | 支撑字段数组 | 必填   | `route_sources.used_for_fields`   | 否          | 必须知道它支撑了什么                                            |
| raw\_text\_excerpt | 摘要片段   | 选填   | `route_sources.raw_text_excerpt`  | 否          | <br />                                                |
| checked\_at        | 核验时间   | 必填   | `route_sources.checked_at`        | 否          | 未核验不得算正式来源                                            |

## 9.2 FAQ 字段

| 字段名                 | 中文说明     | 是否必填 | 表字段                            | 是否允许 AI 起草 | 审核要求           |
| ------------------- | -------- | ---- | ------------------------------ | ---------- | -------------- |
| faq\_id             | FAQ ID   | 必填   | `route_faqs.faq_id`            | 否          | 唯一             |
| question            | 问题       | 必填   | `route_faqs.question`          | 是          | 可以 AI 起草，但必须审核 |
| answer              | 回答       | 必填   | `route_faqs.answer`            | 是          | 必须引用已存在来源或字段   |
| source\_basis       | 引用依据     | 必填   | `route_faqs.source_basis`      | 否          | 没依据不得通过        |
| generated\_by\_ai   | 是否 AI 起草 | 必填   | `route_faqs.generated_by_ai`   | 否          | 自动记录           |
| reviewed\_by\_human | 是否人工审核   | 必填   | `route_faqs.reviewed_by_human` | 否          | 未人工审核不得发布      |
| display\_order      | 展示顺序     | 选填   | `route_faqs.display_order`     | 否          | 默认 100         |

## 10. AD08 审核详情页字段

## 10.1 审核结论字段

| 字段名                  | 中文说明   | 是否必填  | 表/来源                       | 是否允许 AI 起草 | 审核要求                        |
| -------------------- | ------ | ----- | -------------------------- | ---------- | --------------------------- |
| review\_result       | 审核结论   | 必填    | 审核动作结果                     | 否          | `approve / return / reject` |
| credibility\_level   | 可信度等级  | 必填    | `routes.credibility_level` | 否          | 只能人工给                       |
| review\_comment      | 审核备注   | 必填    | 审核动作结果                     | 否          | 不得写空话                       |
| return\_reason\_list | 退回原因列表 | 退回时必填 | 审核动作结果                     | 否          | 建议结构化                       |
| reject\_reason       | 淘汰原因   | 淘汰时必填 | 审核动作结果                     | 否          | 必须命中明确问题                    |
| reviewed\_by         | 审核人    | 必填    | 审计信息                       | 否          | <br />                      |
| reviewed\_at         | 审核时间   | 必填    | 审计信息                       | 否          | <br />                      |

## 10.2 审核检查项字段

以下字段建议在审核页做成勾选清单，而不是自由描述：

| 字段名                              | 中文说明           | 是否必填 | 表/来源 | 是否允许 AI 起草 | 审核要求 |
| -------------------------------- | -------------- | ---- | ---- | ---------- | ---- |
| check\_main\_path\_clear         | 主路径是否明确        | 必填   | 审核清单 | 否          | 布尔   |
| check\_public\_infra\_exists     | 是否有公共化迹象       | 必填   | 审核清单 | 否          | 布尔   |
| check\_exit\_available           | 是否有下撤方案        | 必填   | 审核清单 | 否          | 布尔   |
| check\_risk\_expressible         | 风险是否可表达        | 必填   | 审核清单 | 否          | 布尔   |
| check\_source\_requirements\_met | 是否达到两类三份证据     | 必填   | 审核清单 | 否          | 布尔   |
| check\_faq\_reviewed             | FAQ 是否已人工审核    | 必填   | 审核清单 | 否          | 布尔   |
| check\_checklist\_ready          | checklist 是否可用 | 必填   | 审核清单 | 否          | 布尔   |

## 11. AD09 发布中心页字段

| 字段名                      | 中文说明          | 是否必填 | 表字段                                         | 是否允许 AI 起草 | 审核要求                                |
| ------------------------ | ------------- | ---- | ------------------------------------------- | ---------- | ----------------------------------- |
| publish\_version\_id     | 发布版本 ID       | 必填   | `route_publish_versions.publish_version_id` | 否          | 系统生成                                |
| schema\_version          | schema 版本     | 必填   | `route_publish_versions.schema_version`     | 否          | 需与 package 版本一致                     |
| content\_version         | 内容版本号         | 必填   | `route_publish_versions.content_version`    | 否          | 自动递增                                |
| geometry\_version        | 几何版本号         | 必填   | `route_publish_versions.geometry_version`   | 否          | 来自 geometry                         |
| faq\_version             | FAQ 版本号       | 必填   | `route_publish_versions.faq_version`        | 否          | <br />                              |
| checklist\_version       | checklist 版本号 | 必填   | `route_publish_versions.checklist_version`  | 否          | <br />                              |
| package\_checksum        | 包校验值          | 必填   | `route_publish_versions.package_checksum`   | 否          | 系统生成                                |
| publish\_status          | 发布状态          | 必填   | `route_publish_versions.publish_status`     | 否          | `published / rolled_back / invalid` |
| published\_by            | 发布人           | 必填   | `route_publish_versions.published_by`       | 否          | <br />                              |
| published\_at            | 发布时间          | 必填   | `route_publish_versions.published_at`       | 否          | <br />                              |
| package\_id              | 包 ID          | 必填   | `route_packages.package_id`                 | 否          | 系统生成                                |
| package\_schema\_version | 包 schema 版本   | 必填   | `route_packages.package_schema_version`     | 否          | 与版本一致                               |
| package\_json            | 完整发布包         | 必填   | `route_packages.package_json`               | 否          | 系统聚合生成                              |
| package\_size\_bytes     | 包大小           | 选填   | `route_packages.package_size_bytes`         | 否          | <br />                              |
| checksum                 | 包校验值          | 必填   | `route_packages.checksum`                   | 否          | 与版本校验值对应                            |

## 12. 后台系统级通用字段

| 字段名            | 中文说明 | 是否必填 | 表/来源                  | 是否允许 AI 起草 | 审核要求         |
| -------------- | ---- | ---- | --------------------- | ---------- | ------------ |
| route\_status  | 路线状态 | 必填   | `routes.route_status` | 否          | 只能由流程驱动改变    |
| created\_at    | 创建时间 | 必填   | 审计字段                  | 否          | 自动记录         |
| updated\_at    | 更新时间 | 必填   | 审计字段                  | 否          | 自动记录         |
| created\_by    | 创建人  | 选填   | 审计字段                  | 否          | MVP 可为空但推荐保留 |
| updated\_by    | 更新人  | 选填   | 审计字段                  | 否          | <br />       |
| admin\_comment | 后台备注 | 选填   | 扩展字段/日志               | 否          | 不得代替正式字段     |

## 13. 字段到前台页面的关键映射

### 13.1 首页/发现页高度依赖

- `summary_short`

- `beginner_fit_reason`

- `route_tags`

- `duration_minutes`

- `distance_km`

- `elevation_gain_m`

### 13.2 详情页高度依赖

- `easiest_panic_point_text`

- `not_for_whom_text`

- `route_logic_summary`

- `exit_logic_summary`

- `faq`

- `route_sources`

### 13.3 在途页高度依赖

- `route_polyline`

- `route_nodes`

- `route_exit_points`

- `route_risk_points`

- `route_weather_rules`

### 13.4 准备页高度依赖

- `route_checklist_profiles`

- `supply_items`

- `checklist_rule_templates`

## 14. 提交审核最小字段门槛

一条路线若缺少以下任一项，不得从 `draft` 提交至 `pending_review`：

- 路线主身份字段完整

- 时长/距离/爬升已由 Agent 补全并经人工确认

- 至少 1 个安全向标签且核心标签已补齐

- 起点/终点完整

- 主轨迹完整

- 至少 1 个关键节点

- 至少 1 个下撤点

- 至少 1 个风险点

- 至少 1 条天气/时间规则

- checklist 必带项已存在

- 证据达到“两类三份”最低要求

- 不存在未处理的高优先级用户上报

## 15. 正式发布最小字段门槛

一条路线若缺少以下任一项，不得从 `approved` 发布：

- `credibility_level = A`

- FAQ 已人工审核

- package 生成成功

- route\_status 已进入 `approved`

- 所有前台必填字段可被聚合成功

## 16. 当前明确不做

- 不做用户侧 UGC 字段；

- 不做多语言翻译字段；

- 不做复杂埋点字段；

- 不做高级权限矩阵字段；

- 不做实时轨迹回放审核字段。

## 17. 下一步建议

有了这份字段清单后，下一步最顺的是：

1. 输出 `后台低保真原型说明 V1`
2. 或直接进入后台前端原型实现

## 18. 文档替代关系

- 本文档是当前后台录入与审核字段清单的权威来源；

- 若字段新增、删减、改名，必须先改本文档，再改页面设计文档和数据库/接口文档。

