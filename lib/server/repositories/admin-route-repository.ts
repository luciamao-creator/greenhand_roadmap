import type {
  AdminRouteListQueryDTO,
  AgentPrefillTriggerDTO,
  CreateRouteDraftDTO,
  MapSyncTriggerDTO,
  PublishPreviewDTO,
  PublishRouteDTO,
  PublishVersionActionDTO,
  ReviewActionDTO,
  UpdateRouteDraftDTO,
  UserReportListQueryDTO,
  UserReportReviewDTO,
} from "../dto/admin-routes";
import type { CreatePublicUserReportDTO, CreateRouteCandidateDTO } from "../dto/public-route-submissions";

export type MaybePromise<T> = T | Promise<T>;
export type AdminRepositoryDriver = "memory" | "pg";

export type AdminRouteRepository = {
  list(query: AdminRouteListQueryDTO): MaybePromise<any>;
  getById(routeId: string): MaybePromise<any>;
  create(input: CreateRouteDraftDTO): MaybePromise<any>;
  createCandidate(input: CreateRouteCandidateDTO): MaybePromise<any>;
  update(routeId: string, patch: UpdateRouteDraftDTO): MaybePromise<any>;
  triggerAgentPrefill(routeId: string, input: AgentPrefillTriggerDTO): MaybePromise<any>;
  getAgentPrefillStatus(routeId: string): MaybePromise<any>;
  triggerMapSync(routeId: string, input: MapSyncTriggerDTO): MaybePromise<any>;
  getMapSyncStatus(routeId: string): MaybePromise<any>;
  createUserReport(routeId: string, input: CreatePublicUserReportDTO): MaybePromise<any>;
  listUserReports(routeId: string, query: UserReportListQueryDTO): MaybePromise<any>;
  reviewUserReport(routeId: string, reportId: string, input: UserReportReviewDTO): MaybePromise<any>;
  getReviewDetail(routeId: string): MaybePromise<any>;
  runReviewAction(routeId: string, input: ReviewActionDTO): MaybePromise<any>;
  createPublishPreview(routeId: string, input: PublishPreviewDTO): MaybePromise<any>;
  publish(routeId: string, input: PublishRouteDTO): MaybePromise<any>;
  listPublishVersions(routeId: string): MaybePromise<any>;
  runPublishVersionAction(
    routeId: string,
    publishVersionId: string,
    input: PublishVersionActionDTO,
  ): MaybePromise<any>;
};
