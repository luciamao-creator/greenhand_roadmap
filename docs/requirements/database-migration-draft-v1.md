# 新手徒步路线库 MVP 数据库 Migration 草案 V1

## 1. 文档信息

- 状态：当前生效，待研发落地为 SQL migration

- 日期：2026-09-05

- 适用范围：PostgreSQL / PostGIS / pgvector 初始化、后台事实层与治理层建表、索引与约束落地

- 关联表设计：`docs/requirements/database-table-design-v1.md`

- 关联实现：`docs/requirements/backend-api-implementation-spec-v1.md`

- 关联接口：`docs/requirements/mvp-api-contract-v1.md`

- 上位约束：`SOUL.md`

## 2. 文档目标

- 把当前表设计继续压到可执行 migration 粒度；

- 明确建表顺序、依赖顺序、索引时机与回退边界；

- 解决“最小草稿创建”与数据库约束之间的落地冲突；

- 给后续真实 SQL 文件提供推荐拆分基线。

## 3. 关键判断

- 当前项目的 `routes` 不是纯发布终态表，而是承接 `candidate -> draft -> pending_review -> approved -> published` 全生命周期；

- 因此数据库层不应在建草稿时就用大量 `NOT NULL` 强行要求终态字段完整；

- “提交审核前必须完整” 与 “正式发布前必须完整” 应主要由服务端校验承担；

- 数据库层重点保证：
  - 主键与外键完整性
  - 状态枚举合法
  - 数值范围合法
  - 发布快照可追溯
  - 异步任务与操作日志可追溯

## 4. 推荐 migration 拆分

### 4.1 `001_enable_extensions.sql`

目标：

- 启用空间与向量能力；

- 为后续表建模提供基础能力。

推荐内容：

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
```

说明：

- 若线上环境暂不允许 `vector`，可先拆到独立 migration，避免阻塞主表上线；

- `postgis` 为 MVP 必需能力，不建议后补。

### 4.2 `002_create_routes.sql`

目标：

- 先建立路线主表；

- 让最小草稿创建可以独立落库。

必须落地的关键字段：

- `route_id`

- `route_slug`

- `route_name`

- `province_code`

- `province_name`

- `city_name`

- `area_name`

- `route_type`

- `map_search_keyword`

- `route_status`

- `agent_prefill_status`

- `map_sync_status`

- `start_point_name`

- `end_point_name`

- `created_at / updated_at / created_by / updated_by`

草稿阶段允许为空的字段：

- `credibility_level`

- `beginner_friendly_level`

- `duration_minutes`

- `distance_km`

- `elevation_gain_m`

- `max_altitude_m`

- `route_logic_summary`

- `exit_logic_summary`

- `easiest_panic_point_text`

- `not_for_whom_text`

- `summary_short`

- `beginner_fit_reason`

- `last_verified_at`

- `last_prefill_at`

- `last_map_synced_at`

推荐 DDL 片段：

```sql
CREATE TABLE routes (
  id BIGSERIAL PRIMARY KEY,
  route_id VARCHAR(64) NOT NULL UNIQUE,
  route_slug VARCHAR(128) NOT NULL UNIQUE,
  route_name VARCHAR(128) NOT NULL,
  province_code VARCHAR(16) NOT NULL,
  province_name VARCHAR(32) NOT NULL,
  city_name VARCHAR(64) NOT NULL,
  area_name VARCHAR(64),
  route_type VARCHAR(32) NOT NULL,
  map_search_keyword VARCHAR(256),
  route_status VARCHAR(32) NOT NULL,
  agent_prefill_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  map_sync_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  credibility_level VARCHAR(4),
  beginner_friendly_level VARCHAR(16),
  duration_minutes INTEGER,
  distance_km NUMERIC(5,1),
  elevation_gain_m INTEGER,
  max_altitude_m INTEGER,
  best_season_text TEXT,
  start_point_name VARCHAR(128) NOT NULL,
  end_point_name VARCHAR(128) NOT NULL,
  transport_summary TEXT,
  route_logic_summary TEXT,
  exit_logic_summary TEXT,
  easiest_panic_point_text TEXT,
  not_for_whom_text TEXT,
  summary_short TEXT,
  beginner_fit_reason TEXT,
  cover_image_url TEXT,
  last_verified_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  last_prefill_at TIMESTAMPTZ,
  last_map_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by VARCHAR(64),
  updated_by VARCHAR(64),
  CHECK (route_status IN ('candidate','draft','pending_review','approved','published','paused','retired')),
  CHECK (agent_prefill_status IN ('pending','running','completed','failed')),
  CHECK (map_sync_status IN ('pending','running','completed','failed','missing')),
  CHECK (credibility_level IS NULL OR credibility_level IN ('A','B','C')),
  CHECK (beginner_friendly_level IS NULL OR beginner_friendly_level IN ('high','medium','low')),
  CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  CHECK (distance_km IS NULL OR distance_km > 0),
  CHECK (elevation_gain_m IS NULL OR elevation_gain_m >= 0)
);
```

### 4.3 `003_create_route_geometry_and_navigation.sql`

目标：

- 落地几何、阶段、节点、下撤点、风险点；

- 形成路线空间真相与导航结构。

推荐建表顺序：

1. `route_geometries`
2. `route_stages`
3. `route_nodes`
4. `route_exit_points`
5. `route_risk_points`

说明：

- `route_geometries` 作为一对一表，不要求与 `routes` 同时创建记录；

- 只有地图同步成功或人工确认空间真相后，才写入该表；

- `source_provider`、`synced_at` 应在建表时一并落下，供审核与追溯使用。

### 4.4 `004_create_fact_helper_tables.sql`

目标：

- 落地标签、天气规则、checklist 画像、FAQ、来源、用户上报。

推荐建表顺序：

1. `route_tags`
2. `route_weather_rules`
3. `route_checklist_profiles`
4. `route_faqs`
5. `route_sources`
6. `route_user_reports`

说明：

- `route_user_reports` 是待审核池，不进入前台真相层；

- `route_faqs.reviewed_by_human` 必须有默认值 `false`；

- `route_sources.used_for_fields` 建议使用 `jsonb` 存字段数组。

### 4.5 `005_create_supply_and_rules.sql`

目标：

- 落地物资库与 checklist 规则模板。

推荐内容：

- `supply_items`

- `checklist_rule_templates`

说明：

- 这两张表属于通用规则资产，建议早建；

- 可在同一批 migration 中插入最小种子数据。

### 4.6 `006_create_publish_tables.sql`

目标：

- 落地发布版本与发布快照。

推荐建表顺序：

1. `route_publish_versions`
2. `route_packages`

说明：

- `route_packages.publish_version_id` 应保持唯一；

- 发布快照必须独立于事实表存在，避免后续编辑污染历史版本。

### 4.7 `007_create_governance_tables.sql`

目标：

- 落地后台审计与异步任务支撑表。

推荐内容：

- `admin_operation_logs`

- `admin_async_jobs`

说明：

- `admin_async_jobs` 属于实现支撑层，不是发布真相来源；

- `admin_operation_logs` 要优先满足追溯，不必一开始就做全字段 diff。

### 4.8 `008_create_indexes.sql`

目标：

- 将普通索引、GIST、GIN、HNSW 索引与表创建解耦；

- 降低主建表失败时的回滚复杂度。

建议包含：

- `routes(route_status, agent_prefill_status, map_sync_status)`

- `route_sources` 的 `hnsw` 向量索引

- 所有 geometry 列的 `GIST`

- `route_packages.package_json` 的 `GIN`

说明：

- 若数据量很小，部分高级索引可延后到二阶段 migration；

- 不建议把所有索引都和建表写在一个超长 SQL 文件里。

### 4.9 `009_seed_minimum_rule_assets.sql`

目标：

- 初始化 MVP 最小物资库与 checklist 规则资产。

建议最小种子：

- `water`

- `powerbank`

- `light_rain_jacket`

- `headlamp`

- `basic_first_aid`

说明：

- 只种最小可跑通集合，不要在 migration 里塞大量运营内容；

- 大规模运营数据应通过后台导入或独立 seed 管道。

## 5. 推荐 helper 函数

### 5.1 `set_updated_at()` 触发器函数

用途：

- 自动维护多数业务表的 `updated_at`。

推荐片段：

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

适用表：

- `routes`

- `route_geometries`

- `route_stages`

- `route_nodes`

- `route_exit_points`

- `route_risk_points`

- `route_tags`

- `route_weather_rules`

- `route_checklist_profiles`

- `route_faqs`

- `route_sources`

- `route_user_reports`

- `supply_items`

- `checklist_rule_templates`

说明：

- `route_publish_versions`、`route_packages`、`admin_operation_logs`、`admin_async_jobs` 不必强制有 `updated_at`；

- 发布与日志类表更适合 append-only。

## 6. 与后台工作流的关键对齐

### 6.1 草稿创建

- `POST /api/admin/routes` 只写入最小事实字段；

- 服务端同步生成：
  - `route_id`
  - `route_slug`
  - `province_code`
  - 默认 `route_status='draft'`
  - 默认 `agent_prefill_status='pending'`
  - 默认 `map_sync_status='pending'`

### 6.2 Agent 预填

- 触发 `admin_async_jobs(job_type='agent_prefill')`；

- 完成后回写：
  - `routes.agent_prefill_status`
  - `routes.last_prefill_at`
  - 建议值字段本体

### 6.3 地图同步

- 触发 `admin_async_jobs(job_type='map_sync')`；

- 成功后写入或更新 `route_geometries`；

- 同步回写：
  - `routes.map_sync_status`
  - `routes.last_map_synced_at`

### 6.4 发布预览与正式发布

- `publish_preview` 与 `publish_package` 都可以走 `admin_async_jobs`；

- 预发布不写 `routes.published_at`；

- 正式发布写：
  - `route_publish_versions`
  - `route_packages`
  - `routes.published_at`
  - `admin_operation_logs`

## 7. 回退策略

- 单张表失败时优先回滚当前 migration 文件，不跨文件混滚；

- `extensions` migration 一旦成功，不建议自动回退；

- `seed` migration 应做到幂等，可重复执行；

- 生产环境不建议删除已建业务表，只允许增量修正。

## 8. 风险提醒

- 如果继续把 `routes` 按终态表建成大量 `NOT NULL`，最小草稿创建会直接失败；

- 如果不提前建 `admin_async_jobs`，Agent 预填、地图同步、发布预览会被迫塞回同步请求；

- 如果把 `route_user_reports` 直接并入正式事实表，会破坏“用户上报先审核”的主干原则。

## 9. 与现有文档关系

- 表字段与索引口径以 `database-table-design-v1.md` 为准；

- 迁移拆分与异步任务理由以 `backend-api-implementation-spec-v1.md` 为准；

- 真实 SQL 文件可以按本文档拆成 `00x_*.sql`，也可以映射到 ORM migration，但顺序与约束意图不应偏离。
