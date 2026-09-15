# 新手徒步路线库 MVP 后台 API 路由文件映射 V1

## 1. 文档信息

- 状态：当前生效，待工程初始化时落地

- 日期：2026-09-05

- 适用范围：Next.js App Router 后台 API 文件结构、handler 拆分、服务调用映射

- 关联实现：`docs/requirements/backend-api-implementation-spec-v1.md`

- 关联接口：`docs/requirements/mvp-api-contract-v1.md`

- 关联 DTO：`docs/requirements/backend-dto-and-validation-spec-v1.md`

- 上位约束：`SOUL.md`

## 2. 文档目标

- 把后台 API 契约进一步映射到真实文件路径；

- 避免工程初始化后把多个领域动作继续塞进单一文件；

- 给后续 Next.js 工程建立一套可直接照抄的 API 目录基线。

## 3. 推荐目录基线

```text
app/
└── api/
    └── admin/
        └── routes/
            ├── route.ts
            ├── [id]/
            │   ├── route.ts
            │   ├── agent-prefill/
            │   │   └── route.ts
            │   ├── map-sync/
            │   │   └── route.ts
            │   ├── user-reports/
            │   │   ├── route.ts
            │   │   └── [reportId]/
            │   │       └── review/
            │   │           └── route.ts
            │   ├── review/
            │   │   └── route.ts
            │   ├── review-detail/
            │   │   └── route.ts
            │   ├── publish-preview/
            │   │   └── route.ts
            │   ├── publish/
            │   │   └── route.ts
            │   └── publish-versions/
            │       ├── route.ts
            │       └── [publishVersionId]/
            │           └── action/
            │               └── route.ts
lib/
├── server/
│   ├── auth/
│   ├── db/
│   ├── dto/
│   ├── services/
│   └── repositories/
```

## 4. 路由文件到接口映射

| 文件路径                                                                            | 承接接口                                                              | HTTP 方法       |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------- |
| `app/api/admin/routes/route.ts`                                                 | `/api/admin/routes`                                               | `GET`, `POST` |
| `app/api/admin/routes/[id]/route.ts`                                            | `/api/admin/routes/:id`                                           | `GET`, `PUT`  |
| `app/api/admin/routes/[id]/agent-prefill/route.ts`                              | `/api/admin/routes/:id/agent-prefill`                             | `GET`, `POST` |
| `app/api/admin/routes/[id]/map-sync/route.ts`                                   | `/api/admin/routes/:id/map-sync`                                  | `GET`, `POST` |
| `app/api/admin/routes/[id]/user-reports/route.ts`                               | `/api/admin/routes/:id/user-reports`                              | `GET`         |
| `app/api/admin/routes/[id]/user-reports/[reportId]/review/route.ts`             | `/api/admin/routes/:id/user-reports/:reportId/review`             | `POST`        |
| `app/api/admin/routes/[id]/review/route.ts`                                     | `/api/admin/routes/:id/review`                                    | `POST`        |
| `app/api/admin/routes/[id]/review-detail/route.ts`                              | `/api/admin/routes/:id/review-detail`                             | `GET`         |
| `app/api/admin/routes/[id]/publish-preview/route.ts`                            | `/api/admin/routes/:id/publish-preview`                           | `POST`        |
| `app/api/admin/routes/[id]/publish/route.ts`                                    | `/api/admin/routes/:id/publish`                                   | `POST`        |
| `app/api/admin/routes/[id]/publish-versions/route.ts`                           | `/api/admin/routes/:id/publish-versions`                          | `GET`         |
| `app/api/admin/routes/[id]/publish-versions/[publishVersionId]/action/route.ts` | `/api/admin/routes/:id/publish-versions/:publishVersionId/action` | `POST`        |

## 5. 每个路由文件的最小职责

### 5.1 `app/api/admin/routes/route.ts`

- `GET`：解析列表查询参数；

- `POST`：解析最小创建草稿 DTO；

- 调用：

  - `AdminRouteListService`

  - `RouteDraftService`

### 5.2 `app/api/admin/routes/[id]/route.ts`

- `GET`：返回工作台聚合数据；

- `PUT`：执行草稿 patch 更新；

- 调用：

  - `AdminRouteListService`

  - `RouteDraftService`

### 5.3 `agent-prefill/route.ts`

- `POST`：触发异步补全任务；

- `GET`：读取任务状态与建议结果；

- 调用：

  - `AgentPrefillService`

### 5.4 `map-sync/route.ts`

- `POST`：触发地图同步任务；

- `GET`：返回地图同步状态与缺失字段；

- 调用：

  - `MapSyncService`

### 5.5 `user-reports/route.ts`

- `GET`：查询待审用户上报列表；

- 调用：

  - `UserReportReviewService`

### 5.6 `user-reports/[reportId]/review/route.ts`

- `POST`：接受并合并或驳回用户上报；

- 调用：

  - `UserReportReviewService`

### 5.7 `review/route.ts`

- `POST`：提审、通过、退回、淘汰、暂停、退休；

- 调用：

  - `RouteReviewService`

### 5.8 `review-detail/route.ts`

- `GET`：返回审核详情聚合数据；

- 调用：

  - `RouteReviewService`

### 5.9 `publish-preview/route.ts`

- `POST`：触发或执行 route package 预览组装；

- 调用：

  - `RoutePublishService`

### 5.10 `publish/route.ts`

- `POST`：正式发布；

- 调用：

  - `RoutePublishService`

### 5.11 `publish-versions/route.ts`

- `GET`：返回路线发布历史；

- 调用：

  - `RoutePublishService`

### 5.12 `publish-versions/[publishVersionId]/action/route.ts`

- `POST`：执行 `pause / invalidate / restore`；

- 调用：

  - `RoutePublishService`

## 6. 推荐伴随文件

建议在 `lib/server/dto/admin-routes.ts` 中集中放 DTO schema：

- `AdminRouteListQueryDTO`

- `CreateRouteDraftDTO`

- `UpdateRouteDraftDTO`

- `AgentPrefillTriggerDTO`

- `MapSyncTriggerDTO`

- `UserReportReviewDTO`

- `ReviewActionDTO`

- `PublishPreviewDTO`

- `PublishRouteDTO`

- `PublishVersionActionDTO`

建议在 `lib/server/services/` 下拆文件：

- `admin-route-list-service.ts`

- `route-draft-service.ts`

- `agent-prefill-service.ts`

- `map-sync-service.ts`

- `user-report-review-service.ts`

- `route-review-service.ts`

- `route-publish-service.ts`

## 7. 工程初始化注意点

- 先不要为每个页面建单独 service，按领域拆分即可；

- handler 只做四件事：

  - 鉴权

  - DTO 解析

  - 调 service

  - 返回统一响应壳

- 不要在 `route.ts` 里直接写 SQL；

- 不要在 `route.ts` 里直接做复杂提审或发布校验。

## 8. 推荐执行顺序

1. 先建 `routes/route.ts` 与 `[id]/route.ts`
2. 再建 `agent-prefill` 与 `map-sync`
3. 再建 `user-reports` 与 `review-detail`
4. 最后建 `publish-preview / publish / publish-versions`

## 9. 与现有文档关系

- 接口语义以 `mvp-api-contract-v1.md` 为准；

- 文件路径拆分以本文档为准；

- DTO 字段与校验以 `backend-dto-and-validation-spec-v1.md` 为准。

