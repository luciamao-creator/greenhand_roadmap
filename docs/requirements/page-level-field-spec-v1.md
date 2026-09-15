# 新手徒步路线库 MVP 页面级字段清单 V1

## 1. 文档信息

- 状态：当前生效，待评审细化
- 日期：2026-09-02
- 适用范围：页面字段定义、前后端联调、内容录入、接口设计
- 关联需求：`docs/requirements/mvp-prd-v2.md`
- 关联技术：`docs/decisions/technical-solution-v2.md`
- 关联原型：`docs/requirements/low-fidelity-prototype-spec-v1.md`
- 上位约束：`SOUL.md`

## 2. 文档目标

- 定义每个核心页面实际展示哪些字段；
- 明确字段是否必填；
- 明确字段来自哪一层：
  - 结构化路线数据；
  - 天气接口；
  - AI 解释服务；
  - 设备定位；
  - 客户端本地状态。
- 明确哪些字段允许 AI 生成，哪些字段必须是人工确认或结构化真相。

## 3. 字段治理原则

### 3.1 来源优先级

- 第一优先：结构化路线库；
- 第二优先：天气与预警接口；
- 第三优先：设备定位与客户端状态；
- 第四优先：AI 解释服务。

### 3.2 AI 使用边界

- `允许 AI 生成`
  - 路线一句话理由；
  - FAQ 回答；
  - 推荐解释；
  - checklist 提示语。
- `不允许 AI 生成`
  - 路线几何；
  - 起终点；
  - 关键节点；
  - 下撤点；
  - 风险点；
  - 当前定位；
  - 天气原始事实。

### 3.3 字段状态说明

- `必填`
  - 缺失时页面不能正式发布或该模块不能展示。
- `选填`
  - 缺失时允许降级展示。
- `可降级`
  - 缺失时以更简化文案、占位状态或隐藏模块处理。

## 4. 页面字段清单

## 4.1 LF01 首页

| 字段名 | 说明 | 是否必填 | 来源 | 是否允许 AI 生成 | 备注 |
| --- | --- | --- | --- | --- | --- |
| current_region_name | 当前默认省份/城市 | 必填 | 客户端本地状态 | 否 | 首次可按默认省份 |
| home_headline | 首页主标题 | 必填 | 固定配置 | 否 | 文案固定维护 |
| home_subtitle | 首页副标题 | 必填 | 固定配置 | 否 | 文案固定维护 |
| daily_status_text | 今日轻提示 | 选填 | 天气接口 + 规则引擎 | 否 | 如“雷雨天谨慎” |
| quick_filter_light | 更轻松入口文案 | 必填 | 固定配置 | 否 | 快捷筛选 |
| quick_filter_scenic | 风景更好入口文案 | 必填 | 固定配置 | 否 | 快捷筛选 |
| quick_filter_safe | 更安心入口文案 | 必填 | 固定配置 | 否 | 快捷筛选 |
| featured_routes | 推荐路线集合 | 必填 | 路线库查询 | 否 | 2-4 条 |
| featured_route_name | 推荐路线名 | 必填 | 结构化路线表 | 否 | 列表子字段 |
| featured_route_city | 推荐路线城市 | 必填 | 结构化路线表 | 否 | 列表子字段 |
| featured_route_reason | 一句新手理由 | 必填 | AI 解释服务 / 已固化摘要 | 是 | 发布前应审核 |
| featured_route_metrics | 时长/爬升简述 | 必填 | 结构化路线表 | 否 | 发布前已确认 |
| featured_route_tags | 推荐标签 | 必填 | 结构化标签表 | 否 | 1-2 个 |
| province_entry_list | 四省入口列表 | 必填 | 固定配置 | 否 | 当前固定四省 |
| safety_entry_visible | 安全说明入口是否显示 | 必填 | 固定配置 | 否 | 默认为 true |

## 4.2 LF02 路线发现页

| 字段名 | 说明 | 是否必填 | 来源 | 是否允许 AI 生成 | 备注 |
| --- | --- | --- | --- | --- | --- |
| filter_region | 省份筛选值 | 必填 | 客户端状态 | 否 | |
| filter_city | 城市筛选值 | 选填 | 客户端状态 | 否 | |
| filter_tags | 标签筛选值 | 选填 | 客户端状态 | 否 | |
| filter_duration | 时长筛选值 | 选填 | 客户端状态 | 否 | |
| filter_intensity | 强度筛选值 | 选填 | 客户端状态 | 否 | |
| sort_mode | 排序方式 | 必填 | 客户端状态 | 否 | 默认推荐优先 |
| route_list | 路线列表 | 必填 | 路线库查询 | 否 | |
| route_id | 路线 ID | 必填 | 结构化路线表 | 否 | |
| route_name | 路线名 | 必填 | 结构化路线表 | 否 | |
| route_region | 区域 | 必填 | 结构化路线表 | 否 | |
| route_cover_image | 路线封面图 | 选填 | 对象存储 | 否 | 无图时降级占位 |
| route_duration_text | 时长 | 必填 | 结构化路线表 | 否 | |
| route_distance_text | 距离 | 必填 | 结构化路线表 | 否 | |
| route_elevation_text | 爬升 | 必填 | 结构化路线表 | 否 | |
| route_beginner_reason | 一句适合新手理由 | 必填 | AI 解释服务 / 已固化摘要 | 是 | 发布前需审核 |
| route_core_tags | 1-3 个核心标签 | 必填 | 结构化标签表 | 否 | |
| route_weather_hint | 今日天气/时间友好度提示 | 选填 | 天气接口 + 规则引擎 | 否 | 可降级隐藏 |
| list_view_mode | 列表/地图辅助模式 | 必填 | 客户端状态 | 否 | 默认列表 |

## 4.3 LF03 路线详情页

| 字段名 | 说明 | 是否必填 | 来源 | 是否允许 AI 生成 | 备注 |
| --- | --- | --- | --- | --- | --- |
| route_id | 路线 ID | 必填 | 结构化路线表 | 否 | |
| route_name | 路线名 | 必填 | 结构化路线表 | 否 | |
| route_city_region | 城市/区域 | 必填 | 结构化路线表 | 否 | |
| route_cover_image | 顶部封面图 | 选填 | 对象存储 | 否 | 无图降级 |
| route_positioning_text | 一句定位 | 必填 | AI 解释服务 / 已固化摘要 | 是 | 例如“茶山轻徒步入门线” |
| route_tags | 标签集合 | 必填 | 结构化标签表 | 否 | |
| beginner_fit_reason | 为什么适合新手 | 必填 | AI 解释服务 / 已固化摘要 | 是 | 发布前需审核 |
| easiest_panic_point | 最容易慌的点 | 必填 | 结构化路线表 + 人工编辑 | 否 | 不允许模型编造 |
| not_for_whom_text | 什么人先别去 | 必填 | 结构化路线表 + 人工编辑 | 否 | 风险边界 |
| duration_minutes | 时长 | 必填 | 结构化路线表 | 否 | |
| distance_km | 距离 | 必填 | 结构化路线表 | 否 | |
| elevation_gain_m | 累计爬升 | 必填 | 结构化路线表 | 否 | |
| best_season_text | 最佳时间 | 选填 | 结构化路线表 | 否 | |
| weather_summary | 今天天气摘要 | 必填 | 天气接口 | 否 | |
| weather_risk_level | 天气风险等级 | 必填 | 天气接口 + 规则引擎 | 否 | |
| not_recommended_conditions | 不适合条件 | 必填 | 结构化路线表 + 规则引擎 | 否 | |
| warning_entry_url | 官方预警入口 | 选填 | 天气接口 / 固定配置 | 否 | |
| route_logic_summary | 路线主逻辑 | 必填 | 结构化路线表 + 人工编辑 | 否 | |
| route_round_trip_type | 是否往返 | 必填 | 结构化路线表 | 否 | |
| exit_logic_summary | 何时该收手 | 必填 | 结构化路线表 + 人工编辑 | 否 | |
| faq_items | FAQ 列表 | 选填 | AI 解释服务 + 检索 | 是 | 每条 FAQ 需可回溯 |
| faq_question | FAQ 问题 | 选填 | 固定模板 / AI 解释服务 | 是 | |
| faq_answer | FAQ 回答 | 选填 | AI 解释服务 + 检索 | 是 | |
| primary_cta_state | 开始导航按钮状态 | 必填 | 规则引擎 | 否 | 正常/降级/禁用 |
| secondary_cta_state | 出发前准备按钮状态 | 必填 | 固定逻辑 | 否 | |

## 4.4 LF04 出发前准备页

| 字段名 | 说明 | 是否必填 | 来源 | 是否允许 AI 生成 | 备注 |
| --- | --- | --- | --- | --- | --- |
| route_id | 路线 ID | 必填 | 结构化路线表 | 否 | |
| route_name | 路线名 | 必填 | 结构化路线表 | 否 | |
| prepare_step_title | 当前步骤标题 | 必填 | 固定配置 | 否 | |
| departure_weather_ok | 今日是否适合 | 必填 | 天气接口 + 规则引擎 | 否 | 布尔/等级 |
| departure_time_ok | 当前时间是否适合 | 必填 | 客户端时间 + 规则引擎 | 否 | |
| departure_risk_summary | 明显风险摘要 | 必填 | 规则引擎 | 否 | |
| checklist_groups | checklist 分组 | 必填 | checklist 组合接口 | 否 | |
| checklist_required_items | 基础必带项 | 必填 | 物资库 + 规则引擎 | 否 | |
| checklist_weather_items | 天气加严项 | 选填 | 物资库 + 规则引擎 | 否 | |
| checklist_risk_items | 风险加严项 | 选填 | 物资库 + 规则引擎 | 否 | |
| checklist_item_name | 单个物资名 | 必填 | 物资库 | 否 | |
| checklist_item_reason | 推荐原因 | 选填 | AI 解释服务 | 是 | 仅解释，不改物资本身 |
| key_alerts | 今天最需要注意的 2-3 件事 | 必填 | 规则引擎 + 人工模板 | 否 | |
| confirm_checklist_read | 已看完 checklist | 必填 | 客户端状态 | 否 | |
| confirm_risk_understood | 已理解风险提示 | 必填 | 客户端状态 | 否 | |
| continue_navigation_enabled | 是否允许继续导航 | 必填 | 客户端状态 + 规则引擎 | 否 | |

## 4.5 LF05 在途导航页

| 字段名 | 说明 | 是否必填 | 来源 | 是否允许 AI 生成 | 备注 |
| --- | --- | --- | --- | --- | --- |
| route_id | 路线 ID | 必填 | 结构化路线表 | 否 | |
| route_name_short | 当前路线名缩略 | 必填 | 结构化路线表 | 否 | |
| current_stage_name | 当前阶段 | 必填 | 设备定位 + 几何判断 | 否 | |
| current_location | 当前定位点 | 必填 | 设备定位 | 否 | |
| route_polyline | 推荐路线 | 必填 | 结构化路线几何 | 否 | |
| key_nodes | 关键节点列表 | 必填 | 结构化路线节点 | 否 | |
| fork_nodes | 岔路点列表 | 选填 | 结构化路线节点 | 否 | |
| exit_points | 下撤点列表 | 选填 | 结构化下撤点 | 否 | |
| risk_points | 风险点列表 | 选填 | 结构化风险点 | 否 | |
| deviation_status | 偏航状态 | 必填 | 设备定位 + 几何判断 | 否 | |
| next_key_node_distance | 距离下一关键点 | 必填 | 设备定位 + 几何判断 | 否 | |
| next_key_node_hint | 下一关键点提示 | 选填 | 结构化节点文案 | 否 | |
| exit_suggestion_text | 下撤建议 | 选填 | 结构化下撤逻辑 + 规则引擎 | 否 | |
| weather_risk_on_route | 当前天气风险 | 必填 | 天气接口 | 否 | |
| risk_banner_type | 风险提示类型 | 选填 | 规则引擎 | 否 | 偏航/岔路/建议收手 |
| risk_banner_text | 风险提示文案 | 必填 | 规则引擎 + 固定模板 | 否 | |
| drawer_status_summary | 当前状态摘要 | 必填 | 规则引擎 | 否 | |
| drawer_subtitle | 底部抽屉副标题 | 选填 | 固定模板 + 结构化状态 | 否 | |
| open_weather_action | 看天气入口 | 必填 | 固定交互 | 否 | |
| open_exit_action | 看下撤说明入口 | 选填 | 固定交互 | 否 | |

## 5. 跨页面通用字段

| 字段名 | 说明 | 是否必填 | 来源 | 是否允许 AI 生成 | 备注 |
| --- | --- | --- | --- | --- | --- |
| route_status | 路线状态 | 必填 | 审核发布系统 | 否 | 草稿/已发布/暂停推荐 |
| credibility_level | 可信度等级 | 必填 | 审核发布系统 | 否 | A/B/C |
| route_tags_display | 页面展示标签 | 必填 | 结构化标签表 | 否 | |
| weather_alert_level | 天气预警等级 | 选填 | 天气接口 | 否 | |
| cache_state | 缓存状态 | 选填 | 客户端状态 | 否 | 弱网场景 |
| last_updated_at | 最近更新时间 | 选填 | 服务端数据 | 否 | |

## 6. 字段到接口映射建议

### 6.1 首页

- `GET /api/routes?featured=true`
- `GET /api/home/weather-summary`

### 6.2 路线发现页

- `GET /api/routes`

### 6.3 路线详情页

- `GET /api/routes/:id`
- `GET /api/routes/:id/faq`
- `GET /api/routes/:id/weather`

### 6.4 出发前准备页

- `GET /api/routes/:id/checklist`
- `GET /api/routes/:id/weather`

### 6.5 在途导航页

- `GET /api/routes/:id/navigation`
- `GET /api/routes/:id/weather`

## 7. 研发注意事项

- 页面必须优先消费结构化字段，不允许先依赖 AI 文本再反推 UI；
- 任何允许 AI 生成的字段，都要支持后台人工覆盖；
- 任何关键风险字段都应保留“无数据时隐藏或降级”的能力；
- 导航页字段更新频率高，应与详情页静态字段分开设计接口；
- checklist 的“推荐原因”与“物资本体”必须拆开存储。

## 8. 替代关系

- 本文档是当前页面级字段定义的权威来源；
- 后续接口文档、后台录入模型、前端页面联调应以本文为准。
