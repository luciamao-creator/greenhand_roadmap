# 新手徒步路线库 MVP API Contract V1

## 1. 文档信息

- 状态：当前生效，已纳入后台录入链路 V2 补丁

- 日期：2026-09-05

- 适用范围：前后端联调、客户端模型定义、服务端接口开发、后台录入与审核

- 关联需求：`docs/requirements/mvp-prd-v2.md`

- 关联技术：`docs/decisions/technical-solution-v2.md`

- 关联字段：`docs/requirements/page-level-field-spec-v1.md`

- 关联后台字段：`docs/requirements/admin-route-ingestion-and-review-field-spec-v1.md`

- 关联模型：`docs/requirements/route-data-model-and-route-package-schema-v1.md`

- 上位约束：`SOUL.md`

## 2. 文档目标

- 定义 MVP 首期前台消费接口契约；

- 定义最小后台录入与审核接口契约；

- 明确请求参数、响应结构、错误码与降级策略；

- 让客户端、服务端、后台三方基于同一份接口契约开发。

## 3. 设计原则

### 3.1 接口分层

- `前台消费接口`

  - 面向首页、发现页、详情页、准备页、在途页。

- `后台管理接口`

  - 面向内容录入、审核、发布。

- `发布包接口`

  - 面向客户端缓存或内部调试，不作为首页默认依赖。

### 3.2 字段来源优先级

- 第一优先：地图 API / 地图 SDK 同步后的结构化路线数据，以及人工审核通过后的结构化事实；

- 第二优先：天气与预警接口；

- 第三优先：客户端定位与本地状态；

- 第四优先：AI 解释字段。

### 3.3 后台录入工作流约定

- 新增路线默认走 `最小人工录入 + Agent 预填 + 人工审核放行`；

- `distance_km / duration_minutes / elevation_gain_m / max_altitude_m` 默认由 Agent 结合地图结果补全草稿，人工确认后生效；

- 地图 API 未返回可用空间真相时，接口必须返回缺失状态，不允许伪造几何结果；

- 用户上报的关键节点、下撤点、风险点必须先进入独立待审核池，不直接写入正式事实表。

### 3.4 响应包裹约定

除流式接口外，所有接口统一返回：

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_20260904_xxx",
  "data": {}
}
```

错误时返回：

```json
{
  "code": "ROUTE_NOT_FOUND",
  "message": "route not found",
  "request_id": "req_20260904_xxx",
  "data": null
}
```

## 4. 通用约定

## 4.1 认证

- MVP 前台消费接口默认可匿名访问；

- 后台管理接口必须要求后台身份认证；

- 当前文档不展开认证协议细节，只定义权限要求。

## 4.2 时间与时区

- 所有时间字段采用 ISO 8601；

- 默认时区为 `Asia/Shanghai`；

- 如接口返回时间范围判断，服务端必须返回已解释后的本地时间语义字段，避免客户端自行猜测。

## 4.3 分页约定

分页接口统一使用：

- `page`

- `page_size`

- `has_more`

- `total`

示例：

```json
{
  "page": 1,
  "page_size": 20,
  "has_more": true,
  "total": 58,
  "items": []
}
```

## 4.4 坐标约定

- 坐标统一使用：

```json
{
  "lng": 120.123456,
  "lat": 30.123456
}
```

- 坐标系细节由地图 SDK 适配层处理，不在页面层接口中暴露。

## 4.5 降级约定

- AI 字段缺失：隐藏对应解释模块或退回人工固定文案；

- 天气字段缺失：展示“天气信息暂不可用”，但不伪造天气事实；

- FAQ 缺失：隐藏 FAQ 区块；

- 封面图缺失：返回 `null`，前端展示默认占位；

- 路线未发布：前台接口不得返回完整详情。

## 4.6 后台状态枚举约定

- `route_status`: `candidate / draft / pending_review / approved / published / paused / retired`

- `agent_prefill_status`: `pending / running / completed / failed`

- `map_sync_status`: `pending / running / completed / failed / missing`

- `report_status`: `pending / accepted / rejected`

## 5. 前台消费接口

## 5.1 `GET /api/home/weather-summary`

### 作用

- 首页顶部“今日轻提示”；

- 不绑定具体路线，只给地区级轻量天气/出行建议。

### Query 参数

| 参数名          | 类型     | 是否必填 | 说明                   |
| ------------ | ------ | ---- | -------------------- |
| region\_code | string | 必填   | 当前地区编码               |
| date         | string | 选填   | 默认今天，格式 `YYYY-MM-DD` |

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_home_weather_001",
  "data": {
    "region_code": "zj-hz",
    "region_name": "杭州",
    "date": "2026-09-04",
    "daily_status_text": "雷雨概率升高，今天更适合半天短线",
    "weather_alert_level": "warn",
    "official_warning_url": "https://example.com/weather-warning"
  }
}
```

### 降级策略

- 如果天气接口失败，返回：

```json
{
  "region_code": "zj-hz",
  "region_name": "杭州",
  "date": "2026-09-04",
  "daily_status_text": null,
  "weather_alert_level": null,
  "official_warning_url": null
}
```

## 5.2 `GET /api/routes`

### 作用

- 首页推荐路线；

- 路线发现页列表；

- 快速筛选与标签筛选。

### Query 参数

| 参数名               | 类型        | 是否必填 | 说明                                        |
| ----------------- | --------- | ---- | ----------------------------------------- |
| featured          | boolean   | 选填   | 是否只取推荐位                                   |
| region            | string    | 选填   | 省份或城市编码                                   |
| city              | string    | 选填   | 城市/区域过滤                                   |
| tags              | string\[] | 选填   | 标签编码数组                                    |
| duration\_bucket  | string    | 选填   | `half_day / one_day / long_half_day`      |
| intensity\_bucket | string    | 选填   | `easy / moderate`                         |
| sort\_mode        | string    | 选填   | `recommended / duration_asc / popularity` |
| page              | integer   | 选填   | 默认 1                                      |
| page\_size        | integer   | 选填   | 默认 20，最大 50                               |

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_routes_001",
  "data": {
    "page": 1,
    "page_size": 20,
    "has_more": false,
    "total": 2,
    "items": [
      {
        "route_id": "zj-hz-jiuxi-longjing-001",
        "route_name": "九溪到龙井轻徒步",
        "province_name": "浙江",
        "city_name": "杭州",
        "area_name": "西湖区",
        "cover_image_url": "https://example.com/jiuxi.jpg",
        "duration_minutes": 150,
        "distance_km": 6.2,
        "elevation_gain_m": 220,
        "summary_short": "一条看得懂地形、也看得懂自己节奏的茶山溪谷入门线。",
        "beginner_fit_reason": "入口清楚、节奏友好、收手成本低。",
        "tags": [
          { "tag_code": "stream_feel", "tag_name": "溪谷感", "tag_group": "scenery" },
          { "tag_code": "mature_trail", "tag_name": "成熟步道", "tag_group": "safety" }
        ],
        "weather_hint": {
          "available": true,
          "text": "今天午后雷雨概率升高，建议尽早出发",
          "risk_level": "warn"
        }
      }
    ]
  }
}
```

### 前端使用说明

- 首页推荐位：使用 `featured=true&page_size=4`

- 发现页：使用筛选参数组合

### 降级策略

- `cover_image_url = null` 时前端展示默认占位；

- `weather_hint.available = false` 时隐藏列表天气提示；

- 未发布路线不得出现在结果中。

## 5.3 `GET /api/routes/:id`

### 作用

- 路线详情页主接口；

- 聚合详情页需要的大部分静态字段。

### Path 参数

| 参数名 | 类型     | 是否必填 | 说明        |
| --- | ------ | ---- | --------- |
| id  | string | 必填   | route\_id |

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_route_detail_001",
  "data": {
    "route_id": "zj-hz-jiuxi-longjing-001",
    "route_name": "九溪到龙井轻徒步",
    "province_name": "浙江",
    "city_name": "杭州",
    "area_name": "西湖区",
    "route_type": "one_way",
    "cover_image_url": "https://example.com/jiuxi.jpg",
    "summary_short": "一条看得懂地形、也看得懂自己节奏的茶山溪谷入门线。",
    "beginner_fit_reason": "入口清楚、节奏友好、收手成本低。",
    "easiest_panic_point_text": "中段上行前有看起来更顺的支路，不要继续贴溪走。",
    "not_for_whom_text": "近期体能状态差、出发过晚、雷雨天气下不建议去。",
    "route_logic_summary": "前段沿溪缓行，中段缓慢上行，后段进入龙井方向。",
    "exit_logic_summary": "若时间已晚或体力明显下降，应在中段及时回撤。",
    "transport_summary": "地铁换公交可达，建议公共交通往返。",
    "duration_minutes": 150,
    "distance_km": 6.2,
    "elevation_gain_m": 220,
    "best_season_text": "春秋优先，雨后湿滑时谨慎",
    "tags": [
      { "tag_code": "stream_feel", "tag_name": "溪谷感", "tag_group": "scenery", "is_core": true },
      { "tag_code": "mature_trail", "tag_name": "成熟步道", "tag_group": "safety", "is_core": true },
      { "tag_code": "first_try", "tag_name": "首次可尝试", "tag_group": "achievement", "is_core": true }
    ],
    "credibility_level": "A",
    "last_verified_at": "2026-09-03T20:00:00+08:00",
    "primary_cta_state": "enabled",
    "secondary_cta_state": "enabled"
  }
}
```

### 降级策略

- `best_season_text`、`transport_summary` 可为空；

- credibility 不是 `A` 时前台必须返回 `ROUTE_NOT_AVAILABLE`。

## 5.4 `GET /api/routes/:id/weather`

### 作用

- 详情页天气摘要；

- 出发前准备页天气判断；

- 在途页天气风险提醒。

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_route_weather_001",
  "data": {
    "route_id": "zj-hz-jiuxi-longjing-001",
    "current_date": "2026-09-04",
    "weather_summary": "今天午后雷雨概率升高，建议 14:30 前开始回撤。",
    "weather_risk_level": "warn",
    "departure_weather_ok": true,
    "departure_time_ok": true,
    "not_recommended_conditions": [
      "雷雨预警",
      "傍晚后继续上行",
      "穿着不防滑鞋底"
    ],
    "official_warning_url": "https://example.com/weather-warning",
    "last_synced_at": "2026-09-04T15:30:00+08:00"
  }
}
```

### 降级策略

- 天气供应商失败时：

  - `weather_summary` 返回 `天气信息暂不可用`

  - `weather_risk_level` 返回 `unknown`

  - 保留结构化 `not_recommended_conditions`

## 5.5 `GET /api/routes/:id/faq`

### 作用

- 路线详情页 FAQ 区块；

- 仅返回已审核 FAQ。

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_route_faq_001",
  "data": {
    "route_id": "zj-hz-jiuxi-longjing-001",
    "items": [
      {
        "faq_id": "faq_001",
        "question": "如果我走到一半觉得累，还适合继续吗？",
        "answer": "如果你已经明显喘、腿发软，或当前时间晚于建议节点，就应该把收手当成正确动作。",
        "source_basis": [
          "route.exit_logic_summary",
          "route.easiest_panic_point_text"
        ]
      }
    ]
  }
}
```

### 降级策略

- 没有 FAQ 时返回空数组，不返回错误。

## 5.6 `GET /api/routes/:id/checklist`

### 作用

- 出发前准备页 checklist；

- 由 `route_checklist_profile + weather + rules engine` 组合得到。

### Query 参数

| 参数名              | 类型     | 是否必填 | 说明                |
| ---------------- | ------ | ---- | ----------------- |
| weather\_context | string | 选填   | 由服务端默认获取，也可传调试上下文 |

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_route_checklist_001",
  "data": {
    "route_id": "zj-hz-jiuxi-longjing-001",
    "departure_weather_ok": true,
    "departure_time_ok": true,
    "departure_risk_summary": "今天可以去，但别拖到傍晚。",
    "checklist_groups": [
      {
        "group_code": "mandatory",
        "group_name": "基础必带",
        "items": [
          {
            "supply_code": "water",
            "supply_name": "足量饮水",
            "required": true,
            "reason_text": "溪谷感强不代表沿途一定能补给。"
          },
          {
            "supply_code": "powerbank",
            "supply_name": "满电手机 + 充电宝",
            "required": true,
            "reason_text": "导航依赖定位，别把电量押在返程之后。"
          }
        ]
      },
      {
        "group_code": "weather",
        "group_name": "天气加严项",
        "items": [
          {
            "supply_code": "light_rain_jacket",
            "supply_name": "轻便雨衣",
            "required": false,
            "reason_text": "午后天气不稳定，建议随身带一件。"
          }
        ]
      }
    ],
    "key_alerts": [
      "午后雷雨概率升高",
      "中段岔路不要跟人流盲走"
    ],
    "continue_navigation_enabled": true
  }
}
```

### 降级策略

- AI `reason_text` 缺失时保留物资本体，不阻塞 checklist 展示；

- 天气上下文不可用时，仅返回基础必带项。

## 5.7 `GET /api/routes/:id/navigation`

### 作用

- 在途导航页主数据；

- 返回静态几何、节点、下撤点、风险点。

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_route_navigation_001",
  "data": {
    "route_id": "zj-hz-jiuxi-longjing-001",
    "route_name_short": "九溪到龙井",
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
    "stages": [
      {
        "stage_id": "stage_02",
        "stage_order": 2,
        "stage_name": "缓慢上行",
        "stage_summary": "继续沿主路向上，不要贴溪误入支路。"
      }
    ],
    "key_nodes": [
      {
        "node_id": "node_fork_01",
        "node_type": "fork",
        "node_name": "关键岔路",
        "point": { "lng": 120.119, "lat": 30.228 },
        "trigger_radius_m": 60,
        "navigation_hint": "继续沿主路向上，不要顺着更平的小路继续贴溪走。",
        "wrong_choice_hint": "顺着贴溪小路继续走会偏离推荐路线。"
      }
    ],
    "exit_points": [
      {
        "exit_point_id": "exit_01",
        "exit_name": "中段回撤点",
        "point": { "lng": 120.126, "lat": 30.233 },
        "exit_condition_text": "体力明显下降或已晚于建议时间时从这里回撤。",
        "exit_action_text": "原路返回，不继续向上。"
      }
    ],
    "risk_points": [
      {
        "risk_point_id": "risk_01",
        "risk_type": "fork_confusion",
        "risk_level": "medium",
        "point": { "lng": 120.119, "lat": 30.228 },
        "risk_title": "前方是关键判断点",
        "risk_text": "这里容易被更平的支路误导。",
        "safe_action_text": "保持沿主路缓慢上行。"
      }
    ],
    "elevation_profile_points": [
      { "distance_m": 0, "altitude_m": 38 },
      { "distance_m": 1200, "altitude_m": 76 },
      { "distance_m": 3200, "altitude_m": 118 }
    ]
  }
}
```

### 客户端补充说明

- `current_location`、`deviation_status`、`next_key_node_distance` 不由此接口返回；

- 这些字段应由客户端定位 + 本地几何判断实时计算；

- 如果后续需要服务端兜底，可新增计算型接口，不污染当前静态导航数据接口。

## 5.8 `GET /api/routes/:id/package`

### 作用

- 获取完整 `route package`；

- 主要用于客户端缓存、弱网预取、内部调试。

### 响应

- `data` 直接返回 [route-data-model-and-route-package-schema-v1.md](file:///Users/bytedance/Library%20/Application%20Support/TRAE%20SOLO/ModularData/ai-agent/work-mode-projects/6a979577e098ae958cc65f3b/docs/requirements/route-data-model-and-route-package-schema-v1.md) 中定义的完整 `route package`。

### 使用约束

- 首页和发现页默认不要直接依赖完整 package；

- 仅在详情页预取、准备页缓存、在途页进入前加载。

## 6. 后台管理接口

## 6.0 `GET /api/admin/routes`

### 作用

- 后台通用路线列表查询；

- 通过状态与缺项过滤承接候选池、审核中心、发布中心。

### Query 参数

| 参数名 | 类型 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| route_status | string | 选填 | `candidate / draft / pending_review / approved / published / paused / retired` |
| province_name | string | 选填 | 省份过滤 |
| city_name | string | 选填 | 城市过滤 |
| evidence_gap_only | boolean | 选填 | 是否只返回证据缺口路线 |
| risk_gap_only | boolean | 选填 | 是否只返回风险缺口路线 |
| faq_unreviewed_only | boolean | 选填 | 是否只返回 FAQ 未人工审核路线 |
| page | integer | 选填 | 默认 1 |
| page_size | integer | 选填 | 默认 20，最大 100 |

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_admin_routes_001",
  "data": {
    "page": 1,
    "page_size": 20,
    "has_more": false,
    "total": 1,
    "items": [
      {
        "route_id": "zj-hz-jiuxi-longjing-001",
        "route_name": "九溪到龙井轻徒步",
        "province_name": "浙江",
        "city_name": "杭州",
        "route_status": "pending_review",
        "completion_ratio": 0.86,
        "evidence_coverage_level": "medium",
        "pending_user_report_count": 2,
        "last_updated_at": "2026-09-05T16:20:00+08:00"
      }
    ]
  }
}
```

## 6.1 `POST /api/admin/routes`

### 作用

- 以最小事实包创建路线草稿；

- 创建后默认进入 `draft`，并进入 Agent 预填准备状态。

### 权限

- 后台编辑、审核角色。

### 请求体示例

```json
{
  "route_name": "九溪到龙井轻徒步",
  "province_name": "浙江",
  "city_name": "杭州",
  "area_name": "西湖区",
  "start_point_name": "九溪公交站",
  "end_point_name": "龙井村",
  "route_type": "one_way",
  "map_search_keyword": "九溪 龙井 徒步",
  "trigger_agent_prefill": true
}
```

### 字段约束

- 不要求创建时传入 `duration_minutes / distance_km / elevation_gain_m / max_altitude_m`；

- 不要求创建时传入来源链接、FAQ、标签候选；

- `trigger_agent_prefill` 默认 `true`，用于创建后自动排队预填任务。

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_admin_create_route_001",
  "data": {
    "route_id": "zj-hz-jiuxi-longjing-001",
    "route_status": "draft",
    "agent_prefill_status": "pending",
    "map_sync_status": "pending"
  }
}
```

## 6.2 `GET /api/admin/routes/:id`

### 作用

- 返回后台工作台聚合数据；

- 用于 AD02 工作台加载当前草稿、补全状态、缺项统计与待审核数量。

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_admin_route_workspace_001",
  "data": {
    "route": {
      "route_id": "zj-hz-jiuxi-longjing-001",
      "route_name": "九溪到龙井轻徒步",
      "route_status": "draft",
      "credibility_level": null,
      "agent_prefill_status": "completed",
      "map_sync_status": "completed",
      "last_prefill_at": "2026-09-05T15:20:00+08:00",
      "last_map_synced_at": "2026-09-05T15:18:00+08:00"
    },
    "completion_summary": {
      "base_facts_ready": true,
      "geometry_ready": true,
      "risk_ready": false,
      "evidence_ready": false,
      "pending_user_report_count": 2
    },
    "missing_items": [
      "risk_points.review_pending",
      "route_sources.missing_reviewed_source",
      "route_faqs.missing_reviewed_items"
    ]
  }
}
```

## 6.3 `POST /api/admin/routes/:id/agent-prefill`

### 作用

- 重新触发 Agent 预填；

- 预填内容包括基础参数草稿、标签候选、FAQ 草稿、来源摘要草稿。

### 请求体示例

```json
{
  "modules": [
    "base_facts",
    "tags",
    "faq",
    "sources"
  ],
  "force_refresh": false
}
```

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_admin_prefill_001",
  "data": {
    "route_id": "zj-hz-jiuxi-longjing-001",
    "agent_prefill_status": "running",
    "job_id": "prefill_job_001"
  }
}
```

## 6.4 `GET /api/admin/routes/:id/agent-prefill`

### 作用

- 查询 Agent 预填状态与建议结果；

- 前端可据此渲染“接受建议值 / 标记异常 / 重新触发”。

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_admin_prefill_status_001",
  "data": {
    "route_id": "zj-hz-jiuxi-longjing-001",
    "agent_prefill_status": "completed",
    "modules": [
      {
        "module": "base_facts",
        "status": "completed",
        "suggestions": {
          "duration_minutes": 150,
          "distance_km": 6.2,
          "elevation_gain_m": 220,
          "max_altitude_m": 118,
          "best_season_text": "春秋优先，雨后湿滑时谨慎"
        },
        "source_basis": [
          "map_api.route_result",
          "agent.summary"
        ]
      },
      {
        "module": "sources",
        "status": "completed",
        "suggestions_count": 3
      }
    ],
    "last_completed_at": "2026-09-05T15:21:00+08:00"
  }
}
```

## 6.5 `POST /api/admin/routes/:id/map-sync`

### 作用

- 主动触发地图结果同步或重拉；

- 用于刷新主轨迹、起终点、范围框、海拔剖面等空间真相。

### 请求体示例

```json
{
  "sync_scope": [
    "geometry",
    "elevation_profile"
  ],
  "provider_hint": "amap",
  "force_refresh": true
}
```

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_admin_map_sync_001",
  "data": {
    "route_id": "zj-hz-jiuxi-longjing-001",
    "map_sync_status": "running",
    "job_id": "map_sync_job_001"
  }
}
```

## 6.6 `GET /api/admin/routes/:id/map-sync`

### 作用

- 查询地图同步结果；

- 明确哪些空间真相已同步、哪些仍缺失。

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_admin_map_sync_status_001",
  "data": {
    "route_id": "zj-hz-jiuxi-longjing-001",
    "map_sync_status": "completed",
    "provider_name": "amap",
    "geometry_available": true,
    "start_point_available": true,
    "end_point_available": true,
    "bounding_box_available": true,
    "elevation_profile_available": true,
    "missing_fields": [],
    "last_synced_at": "2026-09-05T15:18:00+08:00"
  }
}
```

### 说明

- 若地图 API 无法返回可用结果，服务端应返回 `map_sync_status = missing` 并给出 `missing_fields`；

- 不允许用自由文本伪造 `route_geometry`。

## 6.7 `PUT /api/admin/routes/:id`

### 作用

- 更新路线基础信息、几何、节点、下撤点、风险点、标签、规则；

- 支持人工接受 Agent 建议值或标记异常值。

### 请求体约定

- 支持分模块 patch；

- 推荐结构：

```json
{
  "route": {
    "summary_short": "一条看得懂地形、也看得懂自己节奏的茶山溪谷入门线。",
    "beginner_fit_reason": "入口清楚、节奏友好、收手成本低。",
    "duration_minutes": 150,
    "distance_km": 6.2,
    "elevation_gain_m": 220,
    "max_altitude_m": 118,
    "base_fact_confirmation": {
      "duration_minutes": "accepted",
      "distance_km": "accepted",
      "elevation_gain_m": "accepted",
      "max_altitude_m": "marked_abnormal"
    }
  },
  "route_geometry": {},
  "route_nodes": [],
  "route_exit_points": [],
  "route_risk_points": [],
  "route_tags": [],
  "route_weather_rules": [],
  "route_checklist_profile": {},
  "route_faqs": [],
  "route_sources": []
}
```

### 说明

- `route_user_reports` 不在本接口内直接写入正式事实，必须经独立审核接口处理；

- 服务端必须校验关键字段完整性，但更新后仍可保持 `draft` 状态，不自动提审；

- 若 `route_geometry` 来自地图同步结果，服务端应记录来源元信息，供审核与追溯使用。

## 6.8 `GET /api/admin/routes/:id/user-reports`

### 作用

- 查询该路线的用户上报待审核池；

- 供几何页、风险页、审核页统一使用。

### Query 参数

| 参数名          | 类型     | 是否必填 | 说明                                         |
| ------------ | ------ | ---- | ------------------------------------------ |
| report_type  | string | 选填   | `node / exit_point / risk_point`           |
| report_status | string | 选填   | 默认 `pending`，也可查 `accepted / rejected` 历史 |

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_admin_user_reports_001",
  "data": {
    "route_id": "zj-hz-jiuxi-longjing-001",
    "items": [
      {
        "report_id": "report_001",
        "report_type": "exit_point",
        "proposal_title": "备用下撤点",
        "proposal_point": { "lng": 120.126, "lat": 30.233 },
        "proposal_text": "下雨时很多人从这里原路返回。",
        "screenshot_url": "https://example.com/report-001.jpg",
        "report_status": "pending",
        "created_at": "2026-09-05T14:30:00+08:00"
      }
    ]
  }
}
```

## 6.9 `POST /api/admin/routes/:id/user-reports/:reportId/review`

### 作用

- 审核单条用户上报；

- 支持接受并合并，或驳回并记录原因。

### 请求体示例

```json
{
  "action": "accept",
  "merge_target_type": "route_exit_points",
  "review_comment": "坐标与截图一致，合并为正式下撤点。"
}
```

### action 枚举

- `accept`

- `reject`

### 说明

- `accept` 时允许服务端自动生成正式对象 ID，并回填 `merged_target_id`；

- `reject` 时 `review_comment` 必填，不得为空话。

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_admin_user_report_review_001",
  "data": {
    "route_id": "zj-hz-jiuxi-longjing-001",
    "report_id": "report_001",
    "report_status": "accepted",
    "merged_target_id": "exit_03"
  }
}
```

## 6.10 `GET /api/admin/routes/:id/review-detail`

### 作用

- 返回审核详情聚合数据；

- 供 AD08 单路线审核详情页直接渲染。

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_admin_review_detail_001",
  "data": {
    "route_id": "zj-hz-jiuxi-longjing-001",
    "route_summary": {
      "route_name": "九溪到龙井轻徒步",
      "route_status": "pending_review",
      "credibility_level_suggestion": "A"
    },
    "completion_summary": {
      "base_facts_ready": true,
      "geometry_ready": true,
      "risk_ready": true,
      "evidence_ready": false
    },
    "evidence_summary": {
      "reviewed_source_count": 2,
      "coverage_level": "medium"
    },
    "pending_user_report_count": 1,
    "review_checklist": [
      {
        "check_code": "route_entry_clear",
        "check_name": "起终点是否齐全",
        "status": "passed"
      },
      {
        "check_code": "evidence_enough",
        "check_name": "证据是否达到两类三份",
        "status": "failed"
      }
    ],
    "latest_operation_logs": [
      {
        "operation_type": "submit_review",
        "operator_name": "审核员 A",
        "created_at": "2026-09-05T16:18:00+08:00"
      }
    ]
  }
}
```

## 6.11 `POST /api/admin/routes/:id/review`

### 作用

- 执行路线审核状态流转。

### 请求体示例

```json
{
  "action": "approve",
  "credibility_level": "A",
  "comment": "关键点、下撤点、天气规则已核验完成"
}
```

### action 枚举

- `submit_review`

- `approve`

- `return`

- `reject`

- `pause`

- `retire`

### 说明

- `return` 表示退回补充，路线回到 `draft`；

- `reject` 表示淘汰，不再继续投入录入成本；

- `submit_review` 时服务端必须校验以下最小门槛：

  - 基础参数已由 Agent 或地图结果补全，并完成人工确认；

  - 地图同步状态不是 `running`；

  - 地图 API 若未返回空间真相，缺失状态已被显式记录；

  - 不存在未处理的高优先级用户上报；

  - 审核必填字段满足 `admin-route-ingestion-and-review-field-spec-v1.md` 要求。

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_admin_review_001",
  "data": {
    "route_id": "zj-hz-jiuxi-longjing-001",
    "route_status": "approved",
    "credibility_level": "A"
  }
}
```

## 6.12 `POST /api/admin/routes/:id/publish-preview`

### 作用

- 生成 route package 预览；

- 用于发布前查看 package 摘要与校验结果，不改变前台生效版本。

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_admin_publish_preview_001",
  "data": {
    "route_id": "zj-hz-jiuxi-longjing-001",
    "preview_job_status": "completed",
    "package_preview": {
      "package_type": "route_package",
      "schema_version": "1.0.0",
      "faq_count": 5,
      "risk_point_count": 3,
      "checksum": "sha256:preview_xxx"
    },
    "validation_summary": {
      "passed": true,
      "issues": []
    }
  }
}
```

## 6.13 `POST /api/admin/routes/:id/publish`

### 作用

- 生成 route package 并发布。

### 前置条件

- `route_status = approved`

- `credibility_level = A`

- 满足发布校验规则

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_admin_publish_001",
  "data": {
    "route_id": "zj-hz-jiuxi-longjing-001",
    "publish_version_id": "pub_zj-hz-jiuxi-longjing-001_v3",
    "package_id": "pkg_zj-hz-jiuxi-longjing-001_v3",
    "route_status": "published"
  }
}
```

## 6.14 `GET /api/admin/routes/:id/publish-versions`

### 作用

- 查询路线的发布历史版本；

- 供 AD10 发布记录与回退页使用。

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_admin_publish_versions_001",
  "data": {
    "route_id": "zj-hz-jiuxi-longjing-001",
    "items": [
      {
        "publish_version_id": "pub_zj-hz-jiuxi-longjing-001_v3",
        "package_id": "pkg_zj-hz-jiuxi-longjing-001_v3",
        "publish_status": "published",
        "version_summary": "补充 1 个下撤点，更新 FAQ 3 条",
        "checksum": "sha256:xxxxx",
        "published_at": "2026-09-05T18:00:00+08:00",
        "published_by": "发布员 A"
      }
    ]
  }
}
```

## 6.15 `POST /api/admin/routes/:id/publish-versions/:publishVersionId/action`

### 作用

- 对历史发布版本执行暂停推荐、标记无效、恢复稳定版本等动作。

### 请求体示例

```json
{
  "action": "restore",
  "comment": "回退到上一稳定版本"
}
```

### action 枚举

- `pause`

- `invalidate`

- `restore`

### 说明

- `pause` 表示当前路线转为 `paused`，不对前台正常曝光；

- `invalidate` 表示该发布版本不再作为有效候选；

- `restore` 表示将指定稳定版本重新设为当前可读版本，并写入新的操作日志。

### 响应示例

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_admin_publish_version_action_001",
  "data": {
    "route_id": "zj-hz-jiuxi-longjing-001",
    "publish_version_id": "pub_zj-hz-jiuxi-longjing-001_v2",
    "route_status": "published",
    "current_live_publish_version_id": "pub_zj-hz-jiuxi-longjing-001_v2"
  }
}
```

## 7. 错误码

| code                        | HTTP 状态 | 说明                 |
| --------------------------- | ------- | ------------------ |
| OK                          | 200     | 成功                 |
| BAD\_REQUEST                | 400     | 参数不合法              |
| UNAUTHORIZED                | 401     | 未认证                |
| FORBIDDEN                   | 403     | 无权限                |
| ROUTE\_NOT\_FOUND           | 404     | 路线不存在              |
| ROUTE\_NOT\_AVAILABLE       | 404     | 路线未发布或不可对外展示       |
| WEATHER\_UNAVAILABLE        | 200     | 天气不可用，走降级数据        |
| FAQ\_UNAVAILABLE            | 200     | FAQ 不可用，返回空列表      |
| CHECKLIST\_DEGRADED         | 200     | checklist 使用降级规则结果 |
| REVIEW\_STATE\_INVALID      | 409     | 审核状态不允许当前操作        |
| AGENT\_PREFILL\_RUNNING     | 409     | Agent 预填任务仍在执行中     |
| MAP\_SYNC\_RUNNING          | 409     | 地图同步任务仍在执行中        |
| MAP\_SYNC\_MISSING          | 200     | 地图同步无可用结果，返回缺失状态   |
| USER\_REPORT\_PENDING       | 409     | 存在未处理的关键用户上报       |
| REVIEW\_REQUIREMENT\_UNMET  | 422     | 提审门槛未满足             |
| PUBLISH\_VALIDATION\_FAILED | 422     | 发布校验未通过            |
| INTERNAL\_ERROR             | 500     | 服务端未知错误            |

## 8. 前端联调注意事项

- 详情页必须同时请求：

  - `/api/routes/:id`

  - `/api/routes/:id/weather`

  - `/api/routes/:id/faq`

- 出发前准备页必须同时请求：

  - `/api/routes/:id/checklist`

  - `/api/routes/:id/weather`

- 在途页必须同时请求：

  - `/api/routes/:id/navigation`

  - `/api/routes/:id/weather`

- 导航页的实时位置判断不依赖详情接口；

- 允许 AI 生成的字段，前端必须允许被后台人工覆盖。

## 9. 服务端实现建议

- `/api/admin/routes` 建议作为后台列表统一入口，通过 `route_status` 与缺项过滤承接候选池、审核中心、发布中心；

- `/api/admin/routes/:id` 与 `/api/admin/routes/:id/review-detail` 应区分“录入工作台聚合”和“审核详情聚合”，不要让单一接口承担所有视图字段；

- `/api/routes/:id` 返回静态详情聚合；

- `/api/routes/:id/navigation` 返回静态导航真相；

- `/api/routes/:id/weather` 返回高频、短缓存天气数据；

- `/api/routes/:id/checklist` 返回规则引擎结果，可按天气短缓存；

- `/api/routes/:id/package` 返回完整发布包，用于缓存与调试；

- `/api/admin/routes/:id/agent-prefill` 与 `/api/admin/routes/:id/map-sync` 建议实现为异步任务接口；

- `/api/admin/routes/:id/user-reports` 必须与正式事实表解耦，避免未审核内容误入发布层；

- `/api/admin/routes/:id/publish-preview` 与 `/api/admin/routes/:id/publish` 应复用同一套 package 组装逻辑，但前者不得写正式发布状态；

- `/api/admin/routes/:id/publish-versions/:publishVersionId/action` 必须写操作日志，并保留当前 live 版本指针；

- 审核与发布接口必须写操作日志。

## 10. 与现有文档关系

- 本文档是当前 API 契约权威来源；

- 结构化字段来源以 `route-data-model-and-route-package-schema-v1.md` 为准；

- 页面字段来源以 `page-level-field-spec-v1.md` 为准；

- 若后续字段变更，必须优先更新模型文档与本接口文档，再改研发实现。
