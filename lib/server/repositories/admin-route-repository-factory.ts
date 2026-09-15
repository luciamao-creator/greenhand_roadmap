import { isPgRepositoryEnabled } from "../db/connection";
import { adminRouteMemoryRepository } from "./admin-route-memory-repository";
import { adminRoutePgRepository } from "./admin-route-pg-repository";
import type { AdminRepositoryDriver, AdminRouteRepository } from "./admin-route-repository";

export function getAdminRouteRepositoryDriver(): AdminRepositoryDriver {
  return isPgRepositoryEnabled() ? "pg" : "memory";
}

export function getAdminRouteRepository(): AdminRouteRepository {
  return getAdminRouteRepositoryDriver() === "pg" ? adminRoutePgRepository : adminRouteMemoryRepository;
}
