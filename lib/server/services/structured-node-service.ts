import type { StructuredNodeGenerateDTO } from "../dto/admin-routes";
import { getAdminRouteRepository } from "../repositories/admin-route-repository-factory";
import { evaluateRouteRiskGate } from "./route-risk-gate-service";

type GeoPoint = {
  type: "Point";
  coordinates: [number, number];
};

type RouteShape = {
  route_id: string;
  route_name: string;
  city_name?: string;
  area_name?: string;
  route_type?: string;
  start_point_name?: string;
  end_point_name?: string;
  route?: Record<string, unknown>;
  route_geometry?: Record<string, unknown>;
  route_nodes?: Array<Record<string, unknown>>;
  route_exit_points?: Array<Record<string, unknown>>;
  route_risk_points?: Array<Record<string, unknown>>;
  route_weather_rules?: Array<Record<string, unknown>>;
  route_checklist_profile?: Record<string, unknown>;
  route_faqs?: Array<Record<string, unknown>>;
  route_sources?: Array<Record<string, unknown>>;
};

type DistanceSample = {
  point: [number, number];
  distanceFromStartM: number;
};

type GenerationBasisItem = {
  basis_type: "geometry_rule" | "text_field" | "source" | "faq" | "weather_rule" | "checklist";
  label: string;
  field?: string;
  source_id?: string;
  source_title?: string;
  matched_keywords?: string[];
  excerpt?: string;
  geometry_version?: number;
};

type TextFieldEvidence = {
  field: string;
  label: string;
  value: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function collectTextFragments(value: unknown, collector: string[]) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      collector.push(trimmed);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextFragments(item, collector);
    }
    return;
  }

  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      collectTextFragments(item, collector);
    }
  }
}

function sanitizeIdPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
}

function extractRouteCoordinates(routePolyline: unknown) {
  if (!isRecord(routePolyline)) {
    return [];
  }

  const coordinates = routePolyline.coordinates;
  if (!Array.isArray(coordinates)) {
    return [];
  }

  const pushCoordinate = (value: unknown, collector: Array<[number, number]>) => {
    if (!Array.isArray(value) || value.length < 2) {
      return;
    }
    const lng = Number(value[0]);
    const lat = Number(value[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return;
    }
    collector.push([lng, lat]);
  };

  const normalized: Array<[number, number]> = [];
  if (coordinates.length > 0 && Array.isArray(coordinates[0]) && typeof coordinates[0][0] === "number") {
    for (const point of coordinates) {
      pushCoordinate(point, normalized);
    }
    return normalized;
  }

  for (const segment of coordinates) {
    if (!Array.isArray(segment)) {
      continue;
    }
    for (const point of segment) {
      pushCoordinate(point, normalized);
    }
  }

  return normalized;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceBetweenMeters(a: [number, number], b: [number, number]) {
  const earthRadiusM = 6371000;
  const dLat = toRadians(b[1] - a[1]);
  const dLng = toRadians(b[0] - a[0]);
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const haversine =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earthRadiusM * Math.asin(Math.sqrt(haversine));
}

function buildDistanceSamples(points: Array<[number, number]>) {
  const samples: DistanceSample[] = [];
  let totalDistanceM = 0;

  for (let index = 0; index < points.length; index += 1) {
    if (index > 0) {
      totalDistanceM += distanceBetweenMeters(points[index - 1], points[index]);
    }
    samples.push({
      point: points[index],
      distanceFromStartM: totalDistanceM,
    });
  }

  return {
    samples,
    totalDistanceM,
  };
}

function pickSampleByFraction(samples: DistanceSample[], totalDistanceM: number, fraction: number) {
  const clamped = Math.min(0.92, Math.max(0.08, fraction));
  const targetDistance = totalDistanceM * clamped;
  let picked = samples[0];

  for (const sample of samples) {
    picked = sample;
    if (sample.distanceFromStartM >= targetDistance) {
      break;
    }
  }

  return picked;
}

function isDistinctEnough(
  point: [number, number],
  picked: Array<[number, number]>,
  minDistanceM: number,
) {
  return picked.every((existingPoint) => distanceBetweenMeters(existingPoint, point) >= minDistanceM);
}

function makePoint(point: [number, number]): GeoPoint {
  return {
    type: "Point",
    coordinates: point,
  };
}

function getFieldSummary(route: RouteShape) {
  const textFragments: string[] = [];
  collectTextFragments(route.route_name, textFragments);
  collectTextFragments(route.area_name, textFragments);
  collectTextFragments(route.city_name, textFragments);
  collectTextFragments(route.start_point_name, textFragments);
  collectTextFragments(route.end_point_name, textFragments);
  collectTextFragments(route.route, textFragments);
  collectTextFragments(route.route_weather_rules, textFragments);
  collectTextFragments(route.route_checklist_profile, textFragments);
  collectTextFragments(route.route_faqs, textFragments);
  return textFragments.join(" | ");
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function getTextFieldEvidence(route: RouteShape): TextFieldEvidence[] {
  const panelRoute = isRecord(route.route) ? route.route : {};
  const entries: TextFieldEvidence[] = [
    { field: "summary_short", label: "路线摘要", value: toNonEmptyString(panelRoute.summary_short) ?? "" },
    { field: "beginner_fit_reason", label: "新手适配", value: toNonEmptyString(panelRoute.beginner_fit_reason) ?? "" },
    { field: "route_logic_summary", label: "路线逻辑", value: toNonEmptyString(panelRoute.route_logic_summary) ?? "" },
    { field: "exit_logic_summary", label: "下撤逻辑", value: toNonEmptyString(panelRoute.exit_logic_summary) ?? "" },
    { field: "transport_summary", label: "交通摘要", value: toNonEmptyString(panelRoute.transport_summary) ?? "" },
    { field: "best_season_text", label: "最佳季节", value: toNonEmptyString(panelRoute.best_season_text) ?? "" },
  ];
  return entries.filter((item) => item.value);
}

function buildGenerationBasis(input: {
  route: RouteShape;
  targetField: "route_nodes" | "route_exit_points" | "route_risk_points";
  geometryLabel: string;
  fraction: number;
  distanceFromStartM: number;
  keywords?: string[];
  preferredFields?: string[];
  includeFaq?: boolean;
  includeWeather?: boolean;
  includeChecklist?: boolean;
}) {
  const basis: GenerationBasisItem[] = [
    {
      basis_type: "geometry_rule",
      label: input.geometryLabel,
      excerpt: `按轨迹约 ${Math.round(input.fraction * 100)}% 的位置采样，距起点约 ${Math.round(input.distanceFromStartM)} 米。`,
      geometry_version: toNumber((isRecord(input.route.route_geometry) ? input.route.route_geometry.geometry_version : undefined) ?? 0),
    },
  ];
  const keywords = (input.keywords ?? []).filter((item) => item.trim().length > 0);
  const seen = new Set<string>(basis.map((item) => `${item.basis_type}:${item.label}:${item.field ?? ""}`));
  const pushBasis = (item: GenerationBasisItem | undefined) => {
    if (!item) {
      return;
    }
    const key = `${item.basis_type}:${item.label}:${item.field ?? ""}:${item.source_id ?? ""}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    basis.push(item);
  };

  const textFields = getTextFieldEvidence(input.route);
  const preferredFieldSet = new Set(input.preferredFields ?? []);
  const preferredMatches = textFields.filter((item) => preferredFieldSet.has(item.field));
  const keywordMatches = textFields.filter((item) =>
    keywords.length === 0 ? false : keywords.some((keyword) => item.value.includes(keyword)),
  );
  for (const item of [...preferredMatches, ...keywordMatches].slice(0, 3)) {
    pushBasis({
      basis_type: "text_field",
      field: item.field,
      label: item.label,
      matched_keywords: keywords.filter((keyword) => item.value.includes(keyword)),
      excerpt: item.value,
    });
  }

  const routeSources = Array.isArray(input.route.route_sources) ? input.route.route_sources : [];
  for (const source of routeSources) {
    if (!isRecord(source)) {
      continue;
    }
    const usedForFields = normalizeStringArray(source.used_for_fields);
    if (usedForFields.length > 0 && !usedForFields.includes(input.targetField)) {
      continue;
    }
    pushBasis({
      basis_type: "source",
      label: toNonEmptyString(source.source_title) ?? "来源依据",
      source_id: toNonEmptyString(source.source_id),
      source_title: toNonEmptyString(source.source_title),
      excerpt:
        toNonEmptyString(source.raw_text_excerpt) ??
        toNonEmptyString(source.source_summary) ??
        undefined,
    });
    if (basis.length >= 5) {
      break;
    }
  }

  if (input.includeFaq) {
    const routeFaqs = Array.isArray(input.route.route_faqs) ? input.route.route_faqs : [];
    for (const faq of routeFaqs) {
      if (!isRecord(faq)) {
        continue;
      }
      const question = toNonEmptyString(faq.question) ?? "";
      const answer = toNonEmptyString(faq.answer) ?? "";
      const sourceBasis = normalizeStringArray(faq.source_basis);
      const faqText = [question, answer, ...sourceBasis].join(" | ");
      if (keywords.length > 0 && !keywords.some((keyword) => faqText.includes(keyword))) {
        continue;
      }
      pushBasis({
        basis_type: "faq",
        label: question || "FAQ 依据",
        excerpt: sourceBasis.join("；") || answer,
      });
      if (basis.length >= 6) {
        break;
      }
    }
  }

  if (input.includeWeather) {
    const weatherRules = Array.isArray(input.route.route_weather_rules) ? input.route.route_weather_rules : [];
    for (const rule of weatherRules) {
      if (!isRecord(rule)) {
        continue;
      }
      pushBasis({
        basis_type: "weather_rule",
        label: `${toNonEmptyString(rule.scenario_type) ?? "天气规则"} / ${toNonEmptyString(rule.severity) ?? "等级未标注"}`,
        excerpt:
          toNonEmptyString(rule.rule_text) ??
          toNonEmptyString(rule.action_text) ??
          undefined,
      });
      break;
    }
  }

  if (input.includeChecklist && isRecord(input.route.route_checklist_profile)) {
    const checklist = input.route.route_checklist_profile;
    const terrainTags = normalizeStringArray(checklist.terrain_tags);
    const mandatorySupplyCodes = normalizeStringArray(checklist.mandatory_supply_codes);
    pushBasis({
      basis_type: "checklist",
      label: "装备与地形画像",
      excerpt: [
        toNonEmptyString(checklist.duration_bucket),
        toNonEmptyString(checklist.intensity_bucket),
        terrainTags.length > 0 ? `地形：${terrainTags.join(" / ")}` : undefined,
        mandatorySupplyCodes.length > 0 ? `必备：${mandatorySupplyCodes.join(" / ")}` : undefined,
        toNonEmptyString(checklist.checklist_note_text),
      ]
        .filter(Boolean)
        .join("；"),
    });
  }

  return basis;
}

function hasAnyKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function buildNodeBlueprints(route: RouteShape, totalDistanceM: number) {
  const label = route.route_name || route.area_name || route.city_name || "路线";
  const routeText = getFieldSummary(route);
  const urbanLike = /湖|堤|塔|公园|景区|街|绿道|城市|断桥|雷峰/.test(routeText);

  const fractions =
    totalDistanceM >= 9000
      ? [0.16, 0.38, 0.63, 0.84]
      : totalDistanceM >= 5000
        ? [0.18, 0.42, 0.7, 0.86]
        : [0.22, 0.52, 0.8];

  const blueprints = [
    {
      fraction: fractions[0],
      node_type: "checkpoint",
      node_name: `${label} 进入主线判断点`,
      navigation_hint: `从 ${route.start_point_name || "起点"} 出发后，优先沿最连续、最明确的主线前进，在这里确认自己仍在主游线上。`,
      wrong_choice_hint: "如果前方出现明显下切小路、施工便道或回头支线，先停一下再回到最宽主线。",
      display_priority: 72,
    },
    {
      fraction: fractions[1],
      node_type: urbanLike ? "view" : "key",
      node_name: urbanLike ? `${label} 中段观景停留点` : `${label} 中段节奏确认点`,
      navigation_hint: urbanLike
        ? "到这里后可短暂停留确认景观参照，再继续沿主游线推进。"
        : "到这里确认体力、补水和方向，继续沿主步道推进，不要被次级岔路带偏。",
      wrong_choice_hint: urbanLike ? "不要被临时拍照停留区带入回头流线。" : "不要追着看起来更近的土路或野路切线走。",
      display_priority: 80,
    },
    {
      fraction: fractions[2],
      node_type: "fork",
      node_name: `${label} 关键岔点`,
      navigation_hint: `在关键岔点优先保持朝 ${route.end_point_name || "终点"} 的主方向推进，按更稳定的主线选路。`,
      wrong_choice_hint: urbanLike ? "景区支路、商业分流线或回头线不要误入。" : "维护便道、下降过快的小路或野路不要贸然进入。",
      display_priority: 88,
    },
  ];

  if (fractions.length > 3) {
    blueprints.push({
      fraction: fractions[3],
      node_type: urbanLike ? "view" : "key",
      node_name: `${route.end_point_name || label} 前收束点`,
      navigation_hint: `进入终点前的最后收束段，确认队伍完整后再一口气走到 ${route.end_point_name || "终点"}。`,
      wrong_choice_hint: "终点前的支路、回撤口或观景绕线不要混走。",
      display_priority: 92,
    });
  }

  return blueprints;
}

function buildRiskBlueprints(route: RouteShape) {
  const routeText = getFieldSummary(route);
  const streamLike = hasAnyKeyword(routeText, ["溪谷", "瀑布", "水位"]);
  const blueprints: Array<{
    fraction: number;
    risk_type: string;
    risk_level: string;
    risk_title: string;
    risk_text: string;
    safe_action_text: string;
    trigger_radius_m: number;
  }> = [];

  if (hasAnyKeyword(routeText, ["湿滑", "打滑", "泥泞", "滑倒"])) {
    blueprints.push({
      fraction: streamLike ? 0.82 : 0.58,
      risk_type: "slippery",
      risk_level: "medium",
      risk_title: streamLike ? "瀑布段石面湿滑" : "路面湿滑易打滑",
      risk_text: streamLike
        ? "溪谷与瀑布附近石面常因水汽和积水变滑，落脚不稳时容易踩空或打滑。"
        : "沿线存在潮湿石阶、碎石或泥面时，步频一快就容易失去稳定。",
      safe_action_text: "进入湿滑段主动降速，优先走更稳的中线，不要边走边拍照。",
      trigger_radius_m: 42,
    });
  }

  if (hasAnyKeyword(routeText, ["岔路", "分叉", "走偏", "迷路", "带偏"])) {
    blueprints.push({
      fraction: 0.38,
      risk_type: "wrong_turn",
      risk_level: "medium",
      risk_title: "岔路判断失误易走偏",
      risk_text: "进入岔路或支线较多的路段时，若只凭直觉追求更近路线，容易偏离主步道。",
      safe_action_text: "到岔口先停下来确认主方向，再决定是否继续推进。",
      trigger_radius_m: 38,
    });
  }

  return blueprints;
}

function buildExitBlueprints(route: RouteShape) {
  const routeText = getFieldSummary(route);
  const blueprints: Array<{
    fraction: number;
    exit_type: string;
    exit_name: string;
    exit_condition_text: string;
    exit_action_text: string;
    exit_priority: string;
  }> = [];

  if (hasAnyKeyword(routeText, ["原路", "折返", "回撤", "返回"])) {
    blueprints.push({
      fraction: 0.34,
      exit_type: "return",
      exit_name: `${route.start_point_name || route.area_name || route.route_name || "路线"} 原路折返点`,
      exit_condition_text: "若体力掉速、天气转差或同行人状态不稳，可在这里停止继续压后半程。",
      exit_action_text: `沿来线原路返回 ${route.start_point_name || "起点"}，不要继续消耗后续路线。`,
      exit_priority: "primary",
    });
  }

  if (hasAnyKeyword(routeText, ["下撤", "提前结束", "最后一段前"])) {
    blueprints.push({
      fraction: 0.8,
      exit_type: "safe_stop",
      exit_name: `${route.end_point_name || route.route_name || "终点"} 前提前下撤判断点`,
      exit_condition_text: "若前方核心路段湿滑、队伍状态下滑或时间已接近返程窗口，可在这里提前结束。",
      exit_action_text: `不要继续硬压到 ${route.end_point_name || "终点"}，改为在这里转身按原路返回。`,
      exit_priority: "secondary",
    });
  }

  return blueprints;
}

export const structuredNodeService = {
  async trigger(routeId: string, input: StructuredNodeGenerateDTO) {
    const repository = getAdminRouteRepository();
    const route = (await repository.getById(routeId)) as RouteShape | undefined;
    if (!route) {
      return undefined;
    }

    const existingCount =
      (route.route_nodes?.length ?? 0) + (route.route_exit_points?.length ?? 0) + (route.route_risk_points?.length ?? 0);
    if (existingCount > 0 && !input.force_refresh) {
      throw new Error("当前路线已存在结构化节点，请使用 force_refresh 覆盖生成。");
    }

    const riskGate = evaluateRouteRiskGate(
      {
        route_id: route.route_id,
        route_type: route.route_type,
        route_anchor_points: isRecord(route.route) ? route.route.route_anchor_points : [],
        route_geometry: isRecord(route.route_geometry) ? route.route_geometry : {},
        route_nodes: route.route_nodes,
        route_exit_points: route.route_exit_points,
        route_risk_points: route.route_risk_points,
      },
      "structured_nodes",
    );
    if (riskGate.blockers.length > 0) {
      throw new Error(riskGate.blockers.join("；"));
    }

    const coordinates = extractRouteCoordinates(route.route_geometry?.route_polyline);
    if (coordinates.length < 2) {
      throw new Error("缺少可用轨迹几何，请先完成地图同步。");
    }

    const { samples, totalDistanceM } = buildDistanceSamples(coordinates);
    const minSpacingM = Math.max(90, Math.min(totalDistanceM * 0.05, 240));

    const takePoint = (fraction: number, chosenPoints: Array<[number, number]>) => {
      const sample = pickSampleByFraction(samples, totalDistanceM, fraction);
      if (!isDistinctEnough(sample.point, chosenPoints, minSpacingM)) {
        return undefined;
      }
      chosenPoints.push(sample.point);
      return sample;
    };

    const routeIdPart = sanitizeIdPart(route.route_id || route.route_name || "route");
    const nodeBlueprints = buildNodeBlueprints(route, totalDistanceM);
    const exitBlueprints = buildExitBlueprints(route);
    const riskBlueprints = buildRiskBlueprints(route);
    const chosenNodePoints: Array<[number, number]> = [];
    const chosenExitPoints: Array<[number, number]> = [];
    const chosenRiskPoints: Array<[number, number]> = [];

    const route_nodes = nodeBlueprints
      .map((blueprint, index) => {
        const sample = takePoint(blueprint.fraction, chosenNodePoints);
        if (!sample) {
          return undefined;
        }
        return {
          node_id: `${routeIdPart}-node-${String(index + 1).padStart(2, "0")}`,
          node_type: blueprint.node_type,
          node_name: blueprint.node_name,
          point: makePoint(sample.point),
          stage_order: index + 1,
          distance_from_start_m: Math.round(sample.distanceFromStartM),
          trigger_radius_m: 36 + index * 2,
          navigation_hint: blueprint.navigation_hint,
          wrong_choice_hint: blueprint.wrong_choice_hint,
          display_priority: blueprint.display_priority,
          generation_basis: buildGenerationBasis({
            route,
            targetField: "route_nodes",
            geometryLabel: "结构化节点轨迹采样",
            fraction: blueprint.fraction,
            distanceFromStartM: sample.distanceFromStartM,
            keywords:
              blueprint.node_type === "fork"
                ? ["岔路", "分叉", "走偏", "主线"]
                : blueprint.node_type === "view"
                  ? ["观景", "景观", "停留"]
                  : ["主线", "补水", "节奏", "终点"],
            preferredFields: ["route_logic_summary", "summary_short", "beginner_fit_reason"],
            includeFaq: true,
            includeChecklist: true,
          }),
        };
      })
      .filter(isDefined)
      .map((item, index) => ({
        ...item,
        stage_order: index + 1,
      }));

    const route_exit_points = exitBlueprints
      .map((blueprint, index) => {
        const sample = takePoint(blueprint.fraction, chosenExitPoints);
        if (!sample) {
          return undefined;
        }
        return {
          exit_point_id: `${routeIdPart}-exit-${String(index + 1).padStart(2, "0")}`,
          exit_name: blueprint.exit_name,
          point: makePoint(sample.point),
          stage_order: index + 1,
          exit_type: blueprint.exit_type,
          exit_condition_text: blueprint.exit_condition_text,
          exit_action_text: blueprint.exit_action_text,
          exit_priority: blueprint.exit_priority,
          generation_basis: buildGenerationBasis({
            route,
            targetField: "route_exit_points",
            geometryLabel: "下撤点轨迹采样",
            fraction: blueprint.fraction,
            distanceFromStartM: sample.distanceFromStartM,
            keywords: ["原路", "折返", "回撤", "返回", "下撤", "提前结束"],
            preferredFields: ["exit_logic_summary", "route_logic_summary", "summary_short"],
            includeFaq: true,
            includeWeather: true,
            includeChecklist: true,
          }),
        };
      })
      .filter(isDefined)
      .map((item, index) => ({
        ...item,
        stage_order: index + 1,
      }));

    const route_risk_points = riskBlueprints
      .map((blueprint, index) => {
        const sample = takePoint(blueprint.fraction, chosenRiskPoints);
        if (!sample) {
          return undefined;
        }
        return {
          risk_point_id: `${routeIdPart}-risk-${String(index + 1).padStart(2, "0")}`,
          risk_type: blueprint.risk_type,
          risk_level: blueprint.risk_level,
          point: makePoint(sample.point),
          stage_order: index + 1,
          risk_title: blueprint.risk_title,
          risk_text: blueprint.risk_text,
          safe_action_text: blueprint.safe_action_text,
          trigger_radius_m: blueprint.trigger_radius_m,
          generation_basis: buildGenerationBasis({
            route,
            targetField: "route_risk_points",
            geometryLabel: "风险点轨迹采样",
            fraction: blueprint.fraction,
            distanceFromStartM: sample.distanceFromStartM,
            keywords:
              blueprint.risk_type === "slippery"
                ? ["湿滑", "打滑", "泥泞", "滑倒", "瀑布", "溪谷"]
                : ["岔路", "分叉", "走偏", "迷路", "带偏"],
            preferredFields: ["summary_short", "route_logic_summary", "exit_logic_summary"],
            includeFaq: true,
            includeWeather: true,
            includeChecklist: true,
          }),
        };
      })
      .filter(isDefined)
      .map((item, index) => ({
        ...item,
        stage_order: index + 1,
      }));

    if (route_nodes.length === 0 && route_exit_points.length === 0 && route_risk_points.length === 0) {
      throw new Error("轨迹过短或采样点过于重叠，暂时无法生成结构化节点草稿。");
    }

    await repository.update(routeId, {
      route_nodes,
      route_exit_points,
      route_risk_points,
    });

    return {
      route_id: route.route_id,
      generation_mode: "draft",
      force_refresh: input.force_refresh ?? false,
      basis: {
        geometry_ready: true,
        text_fields_used: [
          "summary_short",
          "beginner_fit_reason",
          "route_logic_summary",
          "exit_logic_summary",
          "transport_summary",
          "route_weather_rules",
          "route_checklist_profile",
          "route_faqs",
        ],
      },
      counts: {
        route_nodes: route_nodes.length,
        route_exit_points: route_exit_points.length,
        route_risk_points: route_risk_points.length,
      },
    };
  },
};
