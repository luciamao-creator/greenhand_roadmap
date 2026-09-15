# 新手徒步路线库 MVP 后台接口实现拆分说明 V1

## 1. 文档信息

- 状态：当前生效，待研发实现评审

- 日期：2026-09-05

- 适用范围：后台服务端拆分、API 路由分组、异步任务实现、联调排期

- 关联页面：`docs/requirements/admin-route-ingestion-and-review-page-design-v1.md`

- 关联字段：`docs/requirements/admin-route-ingestion-and-review-field-spec-v1.md`

- 关联接口：`docs/requirements/mvp-api-contract-v1.md`

- 关联模型：`docs/requirements/route-data-model-and-route-package-schema-v1.md`

- 关联表设计：`docs/requirements/database-table-design-v1.md`

- 关联技术：`docs/decisions/technical-solution-v2.md`

- 上位约束：`SOUL.md`

## 2. 文档目标

- 把后台 API 契约继续压实到研发可开工粒度；

- 明确哪些动作应做成同步接口，哪些必须走异步任务；

- 明确页面、接口、服务层、数据表之间的推荐映射；

- 给 MVP 后台研发一个低成本、可迭代、可回退的实现基线。

## 3. 范围与非目标

### 3.1 本文档覆盖范围

- 候选池、路线工作台、审核中心、发布中心、发布记录的后台接口实现拆分；

- Agent 预填、地图同步、发布包生成三类异步任务的最小实现方案；

- 后台角色权限边界与操作日志要求；

- 页面到接口的联调映射。

### 3.2 本文档非目标

- 不展开后台登录鉴权协议与账号体系细节；

- 不展开前台消费接口实现细节；

- 不定义地图供应商 SDK 接入细节；

- 不定义 LLM prompt 或 RAG chunk 结构细节。

## 4. 实现基线判断

- MVP 后台继续采用 `Next.js + API Routes/BFF` 一体化起步；

- 后台接口应按领域拆分，而不是按页面各写一个超大 handler；

- 所有会超过 2 秒、依赖外部供应商、可能重试的动作，都不应阻塞在同步请求里；

- `route_user_reports` 必须与正式事实写入解耦，避免未审核用户内容进入发布层；

- 审核、发布、回退必须写 `admin_operation_logs`，保证可追溯。

## 5. 推荐分层

### 5.1 API 路由层

- 负责鉴权、参数校验、请求解析、响应包裹；

- 不直接拼复杂业务逻辑；

- 只调用应用服务层。

### 5.2 应用服务层

建议至少拆成以下服务：

| 服务名                        | 职责                             |
| -------------------------- | ------------------------------ |
| `AdminRouteListService`    | 提供候选池、工作台、审核中心、发布中心列表查询        |
| `RouteDraftService`        | 创建草稿、更新路线事实、保存草稿               |
| `AgentPrefillService`      | 触发 Agent 预填、查询建议结果、写回补全状态      |
| `MapSyncService`           | 触发地图同步、处理地图缺失、落库空间真相元信息        |
| `UserReportReviewService`  | 查询用户上报、接受合并、驳回记录               |
| `RouteReviewService`       | 提审、审核通过、退回、淘汰                  |
| `RoutePublishService`      | 生成 package 预览、正式发布、暂停推荐、恢复稳定版本 |
| `AdminOperationLogService` | 记录关键操作与状态流转日志                  |

### 5.3 Repository 层

- `RoutesRepository`

- `RouteGeometryRepository`

- `RouteFactsRepository`

- `RouteUserReportsRepository`

- `RoutePublishRepository`

- `AdminOperationLogsRepository`

- 如需任务落库，增加 `AdminAsyncJobsRepository`

说明：

- Repository 层只负责持久化，不承担审核门槛判断；

- 发布校验、用户上报合并、参数确认状态等逻辑必须留在服务层。

## 6. 接口分组建议

### 6.1 路线列表与工作台组

目标：

- 支持 AD01 候选池、AD02 工作台、AD07 审核中心、AD09 发布中心的列表查询；

- 用同一组列表接口承接不同状态，不为每个页面重复造接口。

推荐接口：

| 接口                          | 作用       | 说明                                             |
| --------------------------- | -------- | ---------------------------------------------- |
| `GET /api/admin/routes`     | 后台路线列表查询 | 通过 `route_status`、省份、城市、完整度等过滤，承接候选池/审核中心/发布中心 |
| `POST /api/admin/routes`    | 创建最小草稿   | 已在 API 契约定义                                    |
| `GET /api/admin/routes/:id` | 工作台聚合查询  | 已在 API 契约定义                                    |
| `PUT /api/admin/routes/:id` | 更新草稿与事实  | 已在 API 契约定义                                    |

列表接口最小 Query 建议：

| 参数                    | 说明                                                                             |
| --------------------- | ------------------------------------------------------------------------------ |
| `route_status`        | `candidate / draft / pending_review / approved / published / paused / retired` |
| `province_name`       | 省份过滤                                                                           |
| `city_name`           | 城市过滤                                                                           |
| `evidence_gap_only`   | 只看证据缺口路线                                                                       |
| `risk_gap_only`       | 只看风险缺口路线                                                                       |
| `faq_unreviewed_only` | 只看 FAQ 未审核路线                                                                   |
| `page / page_size`    | 分页                                                                             |

### 6.2 Agent 预填组

目标：

- 将“创建草稿后自动跑首轮补全”和“手动重新触发补全”统一到一套异步任务实现；

- 让前端只关心任务状态与建议结果，不关心具体模型调用过程。

推荐接口：

| 接口                                         | 作用          |
| ------------------------------------------ | ----------- |
| `POST /api/admin/routes/:id/agent-prefill` | 触发或重跑补全     |
| `GET /api/admin/routes/:id/agent-prefill`  | 查询补全状态与建议结果 |

模块粒度建议：

- `base_facts`

- `tags`

- `faq`

- `sources`

说明：

- 不建议为每个模块拆成独立 API 路径，先用统一任务入口控制复杂度；

- 服务端内部可以按模块 fan-out。

### 6.3 地图同步组

目标：

- 将地图结果同步与空间真相落库独立出来；

- 避免在普通 `PUT /routes/:id` 时混入地图拉取副作用。

推荐接口：

| 接口                                    | 作用                |
| ------------------------------------- | ----------------- |
| `POST /api/admin/routes/:id/map-sync` | 触发地图同步或刷新         |
| `GET /api/admin/routes/:id/map-sync`  | 查询同步状态、缺失字段、供应商结果 |

说明：

- 地图 API 没结果时，返回 `missing` 而不是失败后强行补文本；

- `route_geometry.source_provider`、`route_geometry.synced_at` 一类元信息应随结果一起写入。

### 6.4 用户上报审核组

目标：

- 承接 AD04/AD05/AD08 的用户上报待审入口；

- 保证待审提议与正式事实表解耦。

推荐接口：

| 接口                                                         | 作用      |
| ---------------------------------------------------------- | ------- |
| `GET /api/admin/routes/:id/user-reports`                   | 查询待审提议  |
| `POST /api/admin/routes/:id/user-reports/:reportId/review` | 接受合并或驳回 |

接受合并时的服务层动作：

1. 校验提议坐标、文本、截图元信息；
2. 根据 `report_type` 写入 `route_nodes / route_exit_points / route_risk_points`；
3. 回填 `merged_target_id`；
4. 写 `admin_operation_logs`；
5. 更新 `route_user_reports.report_status`。

### 6.5 审核组

目标：

- 把“提审”和“人工审核结论”保留在显式状态机里；

- 不允许保存草稿时自动触发审核副作用。

推荐接口：

| 接口                                        | 作用                 |
| ----------------------------------------- | ------------------ |
| `POST /api/admin/routes/:id/review`       | 提审、通过、退回、淘汰、暂停、退休  |
| `GET /api/admin/routes/:id/review-detail` | 审核详情聚合查询，供 AD08 使用 |

`review-detail` 推荐返回：

- 路线摘要

- 结构化完整度

- 证据覆盖度

- 用户上报待处理数

- 审核清单默认值

- 最近操作日志摘要

### 6.6 发布与回退组

目标：

- 支持 AD09 发布中心、AD10 发布历史与恢复动作；

- 让“预览 package”和“正式发布”分离，避免误发布。

推荐接口：

| 接口                                                                     | 作用                                     |
| ---------------------------------------------------------------------- | -------------------------------------- |
| `POST /api/admin/routes/:id/publish-preview`                           | 生成 route package 预览，不正式发布              |
| `POST /api/admin/routes/:id/publish`                                   | 正式发布                                   |
| `GET /api/admin/routes/:id/publish-versions`                           | 查询发布历史                                 |
| `POST /api/admin/routes/:id/publish-versions/:publishVersionId/action` | 对历史版本执行 `pause / invalidate / restore` |

说明：

- `publish-preview` 可以复用发布组装逻辑，但不得写 `published` 状态；

- `restore` 本质是将旧稳定版本重新设为当前前台可读版本，并写新操作日志；

- MVP 阶段不做复杂 diff，只返回 package 摘要与 checksum。

## 7. 异步任务实现建议

### 7.1 哪些动作必须异步

- Agent 预填

- 地图同步

- 发布前 package 组装与校验

### 7.2 推荐最小实现

- 采用数据库驱动的轻量任务表，不先引入外部消息队列；

- 使用一个后台 worker 或定时拉取 runner 执行 `pending` 任务；

- API 同步返回 `job_id`，前端轮询业务状态接口。

### 7.3 任务表建议

实现层可新增内部表 `admin_async_jobs`，该表不属于路线发布真相层。

建议字段：

| 字段                                      | 说明                                                             |
| --------------------------------------- | -------------------------------------------------------------- |
| `job_id`                                | 任务 ID                                                          |
| `job_type`                              | `agent_prefill / map_sync / publish_preview / publish_package` |
| `route_id`                              | 关联路线                                                           |
| `job_status`                            | `pending / running / succeeded / failed / cancelled`           |
| `payload_json`                          | 任务载荷                                                           |
| `result_json`                           | 结果摘要                                                           |
| `retry_count`                           | 重试次数                                                           |
| `error_message`                         | 错误摘要                                                           |
| `created_at / started_at / finished_at` | 生命周期时间                                                         |
| `created_by`                            | 发起人                                                            |

### 7.4 重试原则

- 地图供应商超时、LLM 暂时失败可自动重试；

- 参数不合法、路线状态不允许等业务错误不自动重试；

- 同一 `route_id + job_type` 在 `running` 时禁止重复启动。

## 8. 页面到接口映射

| 页面           | 主要接口                                                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AD01 候选池     | `GET /api/admin/routes?route_status=candidate`、`POST /api/admin/routes`                                                                                                                                    |
| AD02 工作台     | `GET /api/admin/routes/:id`                                                                                                                                                                                |
| AD03 基础事实    | `GET /api/admin/routes/:id`、`GET /api/admin/routes/:id/agent-prefill`、`POST /api/admin/routes/:id/agent-prefill`、`PUT /api/admin/routes/:id`                                                               |
| AD04 几何导航    | `GET /api/admin/routes/:id/map-sync`、`POST /api/admin/routes/:id/map-sync`、`GET /api/admin/routes/:id/user-reports`、`POST /api/admin/routes/:id/user-reports/:reportId/review`、`PUT /api/admin/routes/:id` |
| AD05 风险天气    | `GET /api/admin/routes/:id`、`GET /api/admin/routes/:id/user-reports`、`POST /api/admin/routes/:id/user-reports/:reportId/review`、`PUT /api/admin/routes/:id`                                                |
| AD06 证据与 FAQ | `GET /api/admin/routes/:id/agent-prefill`、`POST /api/admin/routes/:id/agent-prefill`、`PUT /api/admin/routes/:id`                                                                                           |
| AD07 审核中心    | `GET /api/admin/routes?route_status=pending_review`                                                                                                                                                        |
| AD08 审核详情    | `GET /api/admin/routes/:id/review-detail`、`POST /api/admin/routes/:id/review`                                                                                                                              |
| AD09 发布中心    | `GET /api/admin/routes?route_status=approved`、`POST /api/admin/routes/:id/publish-preview`、`POST /api/admin/routes/:id/publish`                                                                            |
| AD10 发布记录    | `GET /api/admin/routes/:id/publish-versions`、`POST /api/admin/routes/:id/publish-versions/:publishVersionId/action`                                                                                        |

## 9. 权限边界建议

| 角色    | 允许动作                      | 禁止动作               |
| ----- | ------------------------- | ------------------ |
| 内容录入员 | 创建草稿、编辑草稿、触发 Agent、触发地图同步 | 最终通过审核、正式发布、恢复历史版本 |
| 审核员   | 提审处理、通过、退回、淘汰、处理用户上报      | 正式发布历史回退可选限制       |
| 发布操作员 | 发布、暂停、恢复稳定版本、查看历史 package | 修改路线事实、改审核结论       |

说明：

- MVP 可由同一人兼任多个角色，但服务端仍应保留权限位；

- 权限校验必须发生在服务端，不依赖前端按钮隐藏。

## 10. 推荐研发顺序

1. 先做 `GET /api/admin/routes` 与 `GET /api/admin/routes/:id`，让后台壳子能跑起来；
2. 再做 `POST /api/admin/routes` 与 `PUT /api/admin/routes/:id`，打通草稿链；
3. 再做 `agent-prefill` 与 `map-sync` 异步任务；
4. 再做 `user-reports` 审核与 `review-detail`；
5. 最后做 `publish-preview`、`publish`、`publish-versions`、`restore`。

## 11. 与现有文档关系

- 页面目标和动作以 `admin-route-ingestion-and-review-page-design-v1.md` 为准；

- 字段口径以 `admin-route-ingestion-and-review-field-spec-v1.md` 为准；

- 外部接口契约以 `mvp-api-contract-v1.md` 为准；

- 本文档是后台实现拆分与排期权威来源，不替代领域模型与字段权威文档。

