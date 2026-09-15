# 新手徒步路线库 MVP 后台 DTO 与校验规则清单 V1

## 1. 文档信息

- 状态：当前生效，待研发实现评审

- 日期：2026-09-05

- 适用范围：后台 API 请求 DTO、响应 DTO、服务端校验规则、状态流转校验

- 关联接口：`docs/requirements/mvp-api-contract-v1.md`

- 关联字段：`docs/requirements/admin-route-ingestion-and-review-field-spec-v1.md`

- 关联实现：`docs/requirements/backend-api-implementation-spec-v1.md`

- 关联表设计：`docs/requirements/database-table-design-v1.md`

- 上位约束：`SOUL.md`

## 2. 文档目标

- 让后台研发在写 handler 前先统一 DTO 口径；

- 明确哪些字段来自客户端、哪些字段必须由服务端派生；

- 明确 transport 校验、业务校验、状态机校验的边界；

- 避免“接口能写进去，但业务不该通过”的灰区实现。

## 3. 校验分层原则

### 3.1 Transport 校验

- 校验 JSON 结构是否完整；

- 校验字段类型、长度、枚举、数组格式；

- 不承担复杂业务判断。

### 3.2 业务校验

- 校验字段间关系；

- 校验路线状态是否允许当前动作；

- 校验是否满足最小录入、提审、发布门槛。

### 3.3 持久化校验

- 依赖数据库唯一键、外键、check constraint 兜底；

- 不应把所有业务规则都压给数据库。

## 4. 通用枚举

| 字段 | 枚举值 |
| --- | --- |
| `route_status` | `candidate / draft / pending_review / approved / published / paused / retired` |
| `route_type` | `loop / out_and_back / one_way` |
| `agent_prefill_status` | `pending / running / completed / failed` |
| `map_sync_status` | `pending / running / completed / failed / missing` |
| `report_type` | `node / exit_point / risk_point` |
| `report_status` | `pending / accepted / rejected` |
| `review_action` | `submit_review / approve / return / reject / pause / retire` |
| `publish_version_action` | `pause / invalidate / restore` |

## 5. 服务端派生字段清单

以下字段不允许前端直接提交：

| 字段 | 派生方式 |
| --- | --- |
| `route_id` | 服务端生成 |
| `route_slug` | 服务端基于名称与地区生成 |
| `province_code` | 服务端根据 `province_name` 映射 |
| `agent_prefill_status` | 服务端状态机维护 |
| `map_sync_status` | 服务端状态机维护 |
| `job_id` | 服务端生成 |
| `publish_version_id` | 服务端生成 |
| `package_id` | 服务端生成 |
| `created_at / updated_at` | 服务端或数据库生成 |
| `merged_target_id` | 用户上报接受合并后由服务端回填 |

## 6. 接口 DTO 与校验

### 6.1 `GET /api/admin/routes`

#### Query DTO

```ts
type AdminRouteListQueryDTO = {
  route_status?: 'candidate' | 'draft' | 'pending_review' | 'approved' | 'published' | 'paused' | 'retired';
  province_name?: string;
  city_name?: string;
  evidence_gap_only?: boolean;
  risk_gap_only?: boolean;
  faq_unreviewed_only?: boolean;
  page?: number;
  page_size?: number;
};
```

#### 校验规则

- `page >= 1`

- `page_size` 取值 `1-100`

- `province_name` 最长 32 字符

- `city_name` 最长 64 字符

#### 响应 DTO 核心项

```ts
type AdminRouteListItemDTO = {
  route_id: string;
  route_name: string;
  province_name: string;
  city_name: string;
  route_status: string;
  completion_ratio: number;
  evidence_coverage_level: 'low' | 'medium' | 'high';
  pending_user_report_count: number;
  last_updated_at: string;
};
```

### 6.2 `POST /api/admin/routes`

#### 请求 DTO

```ts
type CreateRouteDraftDTO = {
  route_name: string;
  province_name: string;
  city_name: string;
  area_name?: string;
  start_point_name: string;
  end_point_name: string;
  route_type: 'loop' | 'out_and_back' | 'one_way';
  map_search_keyword?: string;
  trigger_agent_prefill?: boolean;
};
```

#### Transport 校验

- `route_name` 必填，长度 `2-128`

- `province_name` 必填，长度 `2-32`

- `city_name` 必填，长度 `2-64`

- `area_name` 选填，最长 `64`

- `start_point_name` / `end_point_name` 必填，最长 `128`

- `map_search_keyword` 选填，最长 `256`

#### 业务校验

- `province_name` 必须属于当前支持省份；

- `route_name + province_name + city_name` 不应与现有活跃路线重复；

- `one_way` 允许起终点不同；

- `loop / out_and_back` 允许起终点相同；

- 若 `trigger_agent_prefill` 缺失，服务端默认写成 `true`。

#### 服务端派生

- 生成 `route_id`

- 生成 `route_slug`

- 生成 `province_code`

- 设置 `route_status='draft'`

- 设置 `agent_prefill_status='pending'`

- 设置 `map_sync_status='pending'`

### 6.3 `GET /api/admin/routes/:id`

#### Path DTO

```ts
type RoutePathDTO = {
  id: string;
};
```

#### 校验规则

- `id` 必须符合 `route_id` 格式；

- 路线不存在时返回 `ROUTE_NOT_FOUND`。

### 6.4 `POST /api/admin/routes/:id/agent-prefill`

#### 请求 DTO

```ts
type AgentPrefillTriggerDTO = {
  modules: Array<'base_facts' | 'tags' | 'faq' | 'sources'>;
  force_refresh?: boolean;
};
```

#### Transport 校验

- `modules` 必填，至少 1 项；

- `modules` 内元素不得重复。

#### 业务校验

- 仅允许 `route_status IN ('draft','pending_review')` 时触发；

- 如果同一路线已有 `agent_prefill` 任务在 `running`，返回 `AGENT_PREFILL_RUNNING`；

- `force_refresh=false` 时可由服务端跳过最近已成功且未变更的模块。

### 6.5 `GET /api/admin/routes/:id/agent-prefill`

#### 响应 DTO 核心项

```ts
type AgentPrefillStatusDTO = {
  route_id: string;
  agent_prefill_status: 'pending' | 'running' | 'completed' | 'failed';
  modules: Array<{
    module: 'base_facts' | 'tags' | 'faq' | 'sources';
    status: 'pending' | 'running' | 'completed' | 'failed';
    suggestions?: Record<string, unknown>;
    suggestions_count?: number;
    source_basis?: string[];
  }>;
  last_completed_at?: string;
};
```

### 6.6 `POST /api/admin/routes/:id/map-sync`

#### 请求 DTO

```ts
type MapSyncTriggerDTO = {
  sync_scope: Array<'geometry' | 'elevation_profile'>;
  provider_hint?: string;
  force_refresh?: boolean;
};
```

#### 校验规则

- `sync_scope` 必填，至少 1 项；

- `provider_hint` 最长 64 字符；

- 若当前已有 `map_sync` 任务运行中，返回 `MAP_SYNC_RUNNING`；

- 仅允许 `route_status IN ('draft','pending_review')` 时触发。

### 6.7 `PUT /api/admin/routes/:id`

#### 请求 DTO

```ts
type UpdateRouteDraftDTO = {
  route?: RoutePatchDTO;
  route_geometry?: RouteGeometryPatchDTO;
  route_nodes?: RouteNodeDTO[];
  route_exit_points?: RouteExitPointDTO[];
  route_risk_points?: RouteRiskPointDTO[];
  route_tags?: RouteTagDTO[];
  route_weather_rules?: RouteWeatherRuleDTO[];
  route_checklist_profile?: RouteChecklistProfileDTO;
  route_faqs?: RouteFaqDTO[];
  route_sources?: RouteSourceDTO[];
};
```

#### `RoutePatchDTO`

```ts
type RoutePatchDTO = {
  route_name?: string;
  area_name?: string;
  duration_minutes?: number;
  distance_km?: number;
  elevation_gain_m?: number;
  max_altitude_m?: number;
  best_season_text?: string;
  transport_summary?: string;
  route_logic_summary?: string;
  exit_logic_summary?: string;
  easiest_panic_point_text?: string;
  not_for_whom_text?: string;
  summary_short?: string;
  beginner_fit_reason?: string;
  beginner_friendly_level?: 'high' | 'medium' | 'low';
  cover_image_url?: string | null;
  last_verified_at?: string;
  base_fact_confirmation?: {
    duration_minutes?: 'accepted' | 'marked_abnormal';
    distance_km?: 'accepted' | 'marked_abnormal';
    elevation_gain_m?: 'accepted' | 'marked_abnormal';
    max_altitude_m?: 'accepted' | 'marked_abnormal';
  };
};
```

#### 关键子 DTO 校验

`RouteGeometryPatchDTO`

- `geometry_version >= 1`

- `route_polyline`、`start_point`、`end_point`、`bounding_box` 同时出现时才允许整体覆盖；

- 若来源是地图同步结果，前端可不传 `source_provider`，由服务端写入。

`RouteNodeDTO`

- `node_id` 必填且唯一；

- `node_type` 必须合法；

- `trigger_radius_m > 0`

`RouteExitPointDTO`

- `exit_priority` 只能是 `primary / secondary`

- `exit_condition_text` 与 `exit_action_text` 必填

`RouteRiskPointDTO`

- `risk_level` 只能是 `low / medium / high`

- `safe_action_text` 必填

`RouteTagDTO`

- 同一路线下 `tag_code` 不允许重复；

- 至少 1 个 `is_core=true` 才允许提审；

- 至少 1 个 `tag_group='safety'` 才允许提审。

`RouteChecklistProfileDTO`

- `duration_bucket`、`intensity_bucket`、`terrain_tags`、`mandatory_supply_codes` 必填；

- `mandatory_supply_codes` 至少 1 项。

`RouteFaqDTO`

- `question`、`answer`、`source_basis` 必填；

- `reviewed_by_human=false` 的 FAQ 不阻止草稿保存，但阻止发布。

`RouteSourceDTO`

- `source_type`、`source_title`、`source_summary`、`credibility_score`、`used_for_fields`、`checked_at` 必填；

- `credibility_score` 建议范围 `1-100`。

#### 通用业务校验

- `PUT` 允许部分 patch；

- `route_user_reports` 不允许通过本接口直接改写；

- `route_status='published'` 时不允许继续用本接口修改事实，必须先走审核/发布流程或创建新版本。

### 6.8 `GET /api/admin/routes/:id/user-reports`

#### Query DTO

```ts
type UserReportListQueryDTO = {
  report_type?: 'node' | 'exit_point' | 'risk_point';
  report_status?: 'pending' | 'accepted' | 'rejected';
};
```

#### 校验规则

- `report_type` 合法枚举；

- `report_status` 合法枚举；

- 默认 `report_status='pending'`。

### 6.9 `POST /api/admin/routes/:id/user-reports/:reportId/review`

#### 请求 DTO

```ts
type UserReportReviewDTO = {
  action: 'accept' | 'reject';
  merge_target_type?: 'route_nodes' | 'route_exit_points' | 'route_risk_points';
  review_comment?: string;
};
```

#### 业务校验

- `action='accept'` 时：
  - `merge_target_type` 必填
  - 当前 `report_status` 必须为 `pending`

- `action='reject'` 时：
  - `review_comment` 必填
  - `review_comment` 不能是空白或空话

- 接受合并后必须生成正式对象并回填 `merged_target_id`。

### 6.10 `GET /api/admin/routes/:id/review-detail`

#### 响应 DTO 核心项

```ts
type ReviewDetailDTO = {
  route_id: string;
  route_summary: {
    route_name: string;
    route_status: 'pending_review' | 'approved' | 'published' | 'paused';
    credibility_level_suggestion?: 'A' | 'B' | 'C';
  };
  completion_summary: {
    base_facts_ready: boolean;
    geometry_ready: boolean;
    risk_ready: boolean;
    evidence_ready: boolean;
  };
  evidence_summary: {
    reviewed_source_count: number;
    coverage_level: 'low' | 'medium' | 'high';
  };
  pending_user_report_count: number;
  review_checklist: Array<{
    check_code: string;
    check_name: string;
    status: 'passed' | 'failed' | 'warning';
  }>;
  latest_operation_logs: Array<{
    operation_type: string;
    operator_name?: string;
    created_at: string;
  }>;
};
```

### 6.11 `POST /api/admin/routes/:id/review`

#### 请求 DTO

```ts
type ReviewActionDTO = {
  action: 'submit_review' | 'approve' | 'return' | 'reject' | 'pause' | 'retire';
  credibility_level?: 'A' | 'B' | 'C';
  comment?: string;
};
```

#### 业务校验

`action='submit_review'`

- 当前状态必须是 `draft`

- 基础参数已补全并完成人工确认

- 地图同步状态不是 `running`

- 地图缺失时必须已记录为 `missing`

- 不存在未处理的高优先级用户上报

- 审核必填字段满足字段清单

`action='approve'`

- 当前状态必须是 `pending_review`

- `credibility_level` 必填

- `credibility_level='A'` 时才允许进入后续发布中心

`action='return'`

- 当前状态必须是 `pending_review`

- `comment` 必填，且应明确到字段层或证据层

`action='reject'`

- 当前状态必须是 `pending_review`

- `comment` 必填

`action='pause'`

- 当前状态必须是 `published`

`action='retire'`

- 当前状态必须是 `paused` 或 `approved`

### 6.12 `POST /api/admin/routes/:id/publish-preview`

#### 请求 DTO

```ts
type PublishPreviewDTO = {
  force_refresh?: boolean;
};
```

#### 业务校验

- 当前状态必须是 `approved`

- `credibility_level` 必须是 `A`

- 必填事实字段完整

- 至少存在 1 个可发布 checklist 画像

- FAQ 与来源满足发布要求

### 6.13 `POST /api/admin/routes/:id/publish`

#### 请求 DTO

```ts
type PublishRouteDTO = {
  comment?: string;
};
```

#### 业务校验

- 必须先通过与 `publish-preview` 一致的发布校验；

- 若 preview 任务刚失败，不允许直接正式发布；

- 写入成功后应返回 `publish_version_id` 与 `package_id`。

### 6.14 `GET /api/admin/routes/:id/publish-versions`

#### 响应 DTO 核心项

```ts
type PublishVersionListItemDTO = {
  publish_version_id: string;
  package_id: string;
  publish_status: 'published' | 'rolled_back' | 'invalid';
  version_summary?: string;
  checksum: string;
  published_at: string;
  published_by?: string;
};
```

### 6.15 `POST /api/admin/routes/:id/publish-versions/:publishVersionId/action`

#### 请求 DTO

```ts
type PublishVersionActionDTO = {
  action: 'pause' | 'invalidate' | 'restore';
  comment?: string;
};
```

#### 业务校验

- `pause` 仅允许当前 live 版本执行；

- `invalidate` 不能作用于当前唯一 live 版本，除非先有替代版本；

- `restore` 的目标版本必须存在，且不能是 `invalid`；

- 所有动作都必须写 `admin_operation_logs`。

## 7. 提审前校验清单

以下校验不要求在草稿保存时全部满足，但在 `submit_review` 时必须通过：

- 路线身份字段完整；

- 基础参数已补全，且关键值已人工确认；

- 几何真相存在，或地图缺失状态已明确；

- 至少 1 个关键节点；

- 至少 1 个下撤点；

- 至少 1 个风险点；

- 至少 1 个 `safety` 标签；

- 至少 1 个 checklist 画像；

- 至少 1 条已核验来源；

- 不存在未处理的高优先级用户上报。

## 8. 发布前校验清单

以下校验在 `publish-preview` 与 `publish` 时必须通过：

- `route_status='approved'`

- `credibility_level='A'`

- `last_verified_at` 存在

- `route_packages` 可成功组装

- `route_faqs.reviewed_by_human=true` 的 FAQ 至少 1 条

- `route_sources.checked_at` 有效且来源足够

- `route_checklist_profiles` 可生成可展示 checklist

- 当前不存在 `running` 状态的关键异步任务

## 9. 推荐实现方式

- Transport 层建议使用 `zod`、`valibot` 或等价 schema 库；

- 业务校验建议放在 service 层，不要散落在 route handler 中；

- DTO 命名建议与本文档保持一致，避免一个接口出现多套别名。

## 10. 与现有文档关系

- 接口路径与响应外壳以 `mvp-api-contract-v1.md` 为准；

- 字段含义与审核要求以 `admin-route-ingestion-and-review-field-spec-v1.md` 为准；

- 本文档是后台 DTO 与服务端校验权威来源。
