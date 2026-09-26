import type { PublishPreviewDTO, PublishRouteDTO, PublishVersionActionDTO } from "../dto/admin-routes";
import { getAdminRouteRepository } from "../repositories/admin-route-repository-factory";
import { buildRouteIndex } from "./rag-index-builder";
import { isEmbeddingConfigured } from "../integrations/embedding-client";

export const routePublishService = {
  async createPreview(routeId: string, input: PublishPreviewDTO) {
    return getAdminRouteRepository().createPublishPreview(routeId, input);
  },

  async publish(routeId: string, input: PublishRouteDTO) {
    const result = getAdminRouteRepository().publish(routeId, input);
    // 发布后刷新 RAG 向量索引，保证新线路可被检索（best-effort，失败不阻断发布）。
    // 注：当前内存仓库未持久化到 data/routes，待仓库改为文件化后此处即覆盖新线路；
    // 届时若需避免每次发布都烧 embedding token，可改为「仅当语料变更时」触发。
    if (isEmbeddingConfigured()) {
      void buildRouteIndex().catch((err) => {
        console.error(`[rag] 发布后重建索引失败（route=${routeId}）：`, err);
      });
    }
    return result;
  },

  async listVersions(routeId: string) {
    return getAdminRouteRepository().listPublishVersions(routeId);
  },

  async runVersionAction(routeId: string, publishVersionId: string, input: PublishVersionActionDTO) {
    return getAdminRouteRepository().runPublishVersionAction(routeId, publishVersionId, input);
  },
};
