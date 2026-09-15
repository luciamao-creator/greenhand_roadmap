import type { CreateRouteDraftDTO, UpdateRouteDraftDTO } from "../dto/admin-routes";
import { getAdminRouteRepository } from "../repositories/admin-route-repository-factory";
import { evaluateRouteRiskGate, shouldSkipAutoMapSync } from "./route-risk-gate-service";

export const routeDraftService = {
  async createDraft(input: CreateRouteDraftDTO) {
    const repository = getAdminRouteRepository();
    const created = await repository.create(input);
    const initialRiskGate = evaluateRouteRiskGate(
      {
        route_id: created.route_id,
        route_type: created.route_type,
        route_anchor_points: [],
        route_geometry: {},
        route_nodes: [],
        route_exit_points: [],
        route_risk_points: [],
      },
      "draft_create",
    );

    let agentPrefillStatus = created.agent_prefill_status;
    let mapSyncStatus = created.map_sync_status;

    if (input.trigger_agent_prefill !== false) {
      try {
        const prefill = await repository.triggerAgentPrefill(created.route_id, {
          modules: ["base_facts", "tags", "faq", "sources"],
          force_refresh: false,
        });
        agentPrefillStatus = prefill?.agent_prefill_status ?? agentPrefillStatus;
      } catch {
        agentPrefillStatus = "failed";
      }
    }

    if (shouldSkipAutoMapSync({ route_type: created.route_type, route_anchor_points: [] })) {
      mapSyncStatus = "missing";
    } else {
      try {
        const mapSync = await repository.triggerMapSync(created.route_id, {
          sync_scope: ["geometry", "elevation_profile"],
          provider_hint: "baidu",
          force_refresh: false,
        });
        mapSyncStatus = mapSync?.map_sync_status ?? mapSyncStatus;
      } catch {
        mapSyncStatus = "failed";
      }
    }

    return {
      route_id: created.route_id,
      route_name: created.route_name,
      route_status: created.route_status,
      agent_prefill_status: agentPrefillStatus,
      map_sync_status: mapSyncStatus,
      created_minimum_facts: {
        province_name: created.province_name,
        city_name: created.city_name,
        area_name: created.area_name,
        start_point_name: created.start_point_name,
        end_point_name: created.end_point_name,
        route_type: created.route_type,
      },
      risk_gate: {
        blockers: initialRiskGate.blockers,
        warnings: initialRiskGate.warnings,
      },
    };
  },

  async updateDraft(routeId: string, input: UpdateRouteDraftDTO) {
    const updated = await getAdminRouteRepository().update(routeId, input);
    if (!updated) {
      return undefined;
    }

    return {
      route_id: updated.route_id,
      route_status: updated.route_status,
      completion_ratio: updated.completion_ratio,
      evidence_coverage_level: updated.evidence_coverage_level,
      updated_at: updated.updated_at,
      panels: {
        route: updated.route ?? {},
        route_geometry: updated.route_geometry ?? {},
        route_nodes: updated.route_nodes ?? [],
        route_exit_points: updated.route_exit_points ?? [],
        route_risk_points: updated.route_risk_points ?? [],
        route_tags: updated.route_tags ?? [],
        route_weather_rules: updated.route_weather_rules ?? [],
        route_checklist_profile: updated.route_checklist_profile ?? {},
        route_faqs: updated.route_faqs ?? [],
        route_sources: updated.route_sources ?? [],
      },
    };
  },
};
