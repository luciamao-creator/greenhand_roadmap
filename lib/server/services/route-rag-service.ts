type RouteFacts = {
  route_name: string;
  route_type?: string;
  start_point_name?: string;
  end_point_name?: string;
  route?: Record<string, unknown>;
  route_sources?: Array<Record<string, unknown>>;
  route_faqs?: Array<Record<string, unknown>>;
  route_checklist_profile?: Record<string, unknown>;
  route_weather_rules?: Array<Record<string, unknown>>;
};

export type RouteRetrievalChunk = {
  source_type: "source" | "faq" | "checklist" | "weather_rule" | "route_text";
  source_id?: string;
  title: string;
  excerpt: string;
  score: number;
  used_for_fields?: string[];
};

export type RouteRetrievalContext = {
  strategy: "single_route_keyword_topk";
  top_chunks: RouteRetrievalChunk[];
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function getModuleFieldHints(modules: string[]) {
  const set = new Set<string>();
  for (const module of modules) {
    if (module === "base_facts") {
      ["route_logic_summary", "summary_short", "beginner_fit_reason"].forEach((item) => set.add(item));
    }
    if (module === "faq") {
      set.add("route_faqs");
    }
    if (module === "sources") {
      ["route_sources", "route_logic_summary", "exit_logic_summary"].forEach((item) => set.add(item));
    }
    if (module === "tags") {
      ["summary_short", "route_logic_summary", "best_season_text"].forEach((item) => set.add(item));
    }
  }
  return set;
}

function scoreUsedForFields(usedForFields: string[], fieldHints: Set<string>) {
  if (usedForFields.length === 0) {
    return 8;
  }
  if (usedForFields.some((item) => fieldHints.has(item))) {
    return 28;
  }
  return 4;
}

export function buildRouteRetrievalContext(route: RouteFacts, modules: string[]): RouteRetrievalContext {
  const fieldHints = getModuleFieldHints(modules);
  const chunks: RouteRetrievalChunk[] = [];

  const panelRoute = route.route ?? {};
  const routeTextCandidates = [
    { title: "路线摘要", excerpt: asString(panelRoute.summary_short), score: 22 },
    { title: "路线逻辑", excerpt: asString(panelRoute.route_logic_summary), score: 24 },
    { title: "下撤逻辑", excerpt: asString(panelRoute.exit_logic_summary), score: 22 },
    { title: "新手适配", excerpt: asString(panelRoute.beginner_fit_reason), score: 20 },
    { title: "交通摘要", excerpt: asString(panelRoute.transport_summary), score: 14 },
    { title: "最佳季节", excerpt: asString(panelRoute.best_season_text), score: 12 },
  ];
  for (const item of routeTextCandidates) {
    if (!item.excerpt) continue;
    chunks.push({
      source_type: "route_text",
      title: item.title,
      excerpt: item.excerpt,
      score: item.score,
    });
  }

  for (const source of route.route_sources ?? []) {
    const usedForFields = asStringArray(source.used_for_fields);
    const excerpt = asString(source.raw_text_excerpt) || asString(source.source_summary);
    if (!excerpt) continue;
    const credibility = typeof source.credibility_score === "number" ? source.credibility_score : Number(source.credibility_score ?? 0);
    chunks.push({
      source_type: "source",
      source_id: asString(source.source_id) || undefined,
      title: asString(source.source_title) || "来源依据",
      excerpt,
      score: scoreUsedForFields(usedForFields, fieldHints) + Math.min(40, Math.max(0, credibility) / 2),
      used_for_fields: usedForFields,
    });
  }

  for (const faq of route.route_faqs ?? []) {
    const question = asString(faq.question);
    const answer = asString(faq.answer);
    const basis = asStringArray(faq.source_basis);
    const excerpt = [question, answer, basis.join("；")].filter(Boolean).join(" | ");
    if (!excerpt) continue;
    chunks.push({
      source_type: "faq",
      source_id: asString(faq.faq_id) || undefined,
      title: question || "常见问题",
      excerpt,
      score: modules.includes("faq") ? 34 : 18,
    });
  }

  const checklist = route.route_checklist_profile ?? {};
  const checklistLines = [
    asString(checklist.duration_bucket) ? `时长桶：${asString(checklist.duration_bucket)}` : "",
    asString(checklist.intensity_bucket) ? `强度桶：${asString(checklist.intensity_bucket)}` : "",
    asStringArray(checklist.terrain_tags).length ? `地形：${asStringArray(checklist.terrain_tags).join("、")}` : "",
    asStringArray(checklist.mandatory_supply_codes).length
      ? `必带：${asStringArray(checklist.mandatory_supply_codes).join("、")}`
      : "",
    asString(checklist.checklist_note_text),
  ].filter(Boolean);
  if (checklistLines.length > 0) {
    chunks.push({
      source_type: "checklist",
      title: "出发前清单画像",
      excerpt: checklistLines.join("；"),
      score: 20,
    });
  }

  for (const rule of route.route_weather_rules ?? []) {
    const scenarioType = asString(rule.scenario_type);
    const severity = asString(rule.severity);
    const ruleText = asString(rule.rule_text);
    const actionText = asString(rule.action_text);
    const excerpt = [scenarioType, severity, ruleText, actionText].filter(Boolean).join(" | ");
    if (!excerpt) continue;
    chunks.push({
      source_type: "weather_rule",
      source_id: asString(rule.weather_rule_id) || undefined,
      title: scenarioType ? `天气规则：${scenarioType}` : "天气规则",
      excerpt,
      score: 16,
    });
  }

  const topChunks = chunks
    .sort((left, right) => right.score - left.score)
    .slice(0, 8)
    .map((item) => ({
      ...item,
      excerpt: item.excerpt.slice(0, 280),
    }));

  return {
    strategy: "single_route_keyword_topk",
    top_chunks: topChunks,
  };
}
