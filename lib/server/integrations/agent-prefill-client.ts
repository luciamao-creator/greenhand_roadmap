export type AgentGeneratedTag = {
  tag_group: string;
  tag_code: string;
  tag_name: string;
  is_core?: boolean;
  sort_order?: number;
};

export type AgentGeneratedFaq = {
  question: string;
  answer: string;
  source_basis?: unknown[];
  display_order?: number;
};

export type AgentGeneratedSource = {
  source_type: "official" | "map" | "travel_note" | "video" | "local_notice";
  source_title: string;
  source_url?: string;
  source_summary: string;
  credibility_score: number;
  used_for_fields?: string[];
  raw_text_excerpt?: string;
};

export type AgentGeneratedChecklistProfile = {
  duration_bucket: "half_day" | "one_day" | "long_half_day";
  intensity_bucket: "easy" | "moderate";
  terrain_tags: string[];
  weather_sensitive_tags?: string[];
  mandatory_supply_codes: string[];
  optional_supply_codes?: string[];
  emergency_supply_codes?: string[];
  checklist_note_text?: string;
};

export type AgentGeneratedWeatherRule = {
  scenario_type: "rain" | "thunder" | "heat" | "cold" | "wind" | "late_start";
  severity: "warn" | "avoid";
  rule_text: string;
  action_text: string;
  threshold_config?: Record<string, unknown>;
};

export type AgentPrefillArtifacts = {
  route_patch?: Record<string, unknown>;
  tags?: AgentGeneratedTag[];
  faqs?: AgentGeneratedFaq[];
  sources?: AgentGeneratedSource[];
  checklist_profile?: AgentGeneratedChecklistProfile;
  weather_rules?: AgentGeneratedWeatherRule[];
};

export type AgentRetrievalChunk = {
  source_type: "source" | "faq" | "checklist" | "weather_rule" | "route_text";
  source_id?: string;
  title: string;
  excerpt: string;
  score: number;
  used_for_fields?: string[];
};

export type AgentRetrievalContext = {
  strategy: string;
  top_chunks: AgentRetrievalChunk[];
};

type AgentPrefillRequest = {
  route_id: string;
  route_name: string;
  province_name: string;
  city_name: string;
  area_name?: string;
  start_point_name: string;
  end_point_name: string;
  route_type: string;
  map_search_keyword?: string;
  modules: string[];
  retrieval_context?: AgentRetrievalContext;
};

type AgentPrefillEnvelope =
  | AgentPrefillArtifacts
  | {
      data?: AgentPrefillArtifacts;
      artifacts?: AgentPrefillArtifacts;
    };

type DeepSeekChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

function getAgentPrefillProvider() {
  return process.env.AGENT_PREFILL_PROVIDER ?? "http";
}

function getAgentPrefillApiUrl() {
  if (getAgentPrefillProvider() === "deepseek") {
    return process.env.AGENT_PREFILL_API_URL ?? "https://api.deepseek.com/v1/chat/completions";
  }
  if (getAgentPrefillProvider() === "qwen" || getAgentPrefillProvider() === "bailian") {
    return (
      process.env.AGENT_PREFILL_API_URL ??
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    );
  }
  return process.env.AGENT_PREFILL_API_URL;
}

function getAgentPrefillApiKey() {
  return process.env.AGENT_PREFILL_API_KEY;
}

export function isAgentPrefillConfigured() {
  if (
    getAgentPrefillProvider() === "deepseek" ||
    getAgentPrefillProvider() === "qwen" ||
    getAgentPrefillProvider() === "bailian"
  ) {
    return Boolean(getAgentPrefillApiKey());
  }
  return Boolean(getAgentPrefillApiUrl());
}

function normalizeEnvelope(payload: AgentPrefillEnvelope): AgentPrefillArtifacts {
  const unwrap = "artifacts" in payload && payload.artifacts
    ? payload.artifacts
    : "data" in payload && payload.data
      ? payload.data
      : (payload as AgentPrefillArtifacts);

  return sanitizeArtifacts(unwrap);
}

function clampInteger(value: unknown, fallback: number, min?: number, max?: number) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  let result = Math.round(numericValue);
  if (typeof min === "number") {
    result = Math.max(min, result);
  }
  if (typeof max === "number") {
    result = Math.min(max, result);
  }
  return result;
}

function sanitizeArtifacts(artifacts: AgentPrefillArtifacts): AgentPrefillArtifacts {
  return {
    route_patch: artifacts.route_patch,
    tags: artifacts.tags?.map((item, index) => ({
      ...item,
      is_core: Boolean(item.is_core),
      sort_order: clampInteger(item.sort_order, (index + 1) * 10, 1, 9999),
    })),
    faqs: artifacts.faqs?.map((item, index) => ({
      ...item,
      display_order: clampInteger(item.display_order, (index + 1) * 10, 1, 9999),
      source_basis: Array.isArray(item.source_basis) ? item.source_basis : [],
    })),
    sources: artifacts.sources?.map((item) => ({
      ...item,
      credibility_score: clampInteger(item.credibility_score, 70, 1, 100),
      used_for_fields: Array.isArray(item.used_for_fields) ? item.used_for_fields : [],
    })),
    checklist_profile: artifacts.checklist_profile
      ? {
          ...artifacts.checklist_profile,
          terrain_tags: Array.isArray(artifacts.checklist_profile.terrain_tags)
            ? artifacts.checklist_profile.terrain_tags
            : [],
          weather_sensitive_tags: Array.isArray(artifacts.checklist_profile.weather_sensitive_tags)
            ? artifacts.checklist_profile.weather_sensitive_tags
            : [],
          mandatory_supply_codes: Array.isArray(artifacts.checklist_profile.mandatory_supply_codes)
            ? artifacts.checklist_profile.mandatory_supply_codes
            : [],
          optional_supply_codes: Array.isArray(artifacts.checklist_profile.optional_supply_codes)
            ? artifacts.checklist_profile.optional_supply_codes
            : [],
          emergency_supply_codes: Array.isArray(artifacts.checklist_profile.emergency_supply_codes)
            ? artifacts.checklist_profile.emergency_supply_codes
            : [],
        }
      : undefined,
    weather_rules: artifacts.weather_rules?.map((item) => ({
      ...item,
      threshold_config:
        item.threshold_config && typeof item.threshold_config === "object" ? item.threshold_config : undefined,
    })),
  };
}

function buildDeepSeekMessages(input: AgentPrefillRequest) {
  const systemPrompt = `
You are a route content prefill engine for a beginner-friendly hiking route admin system.
Return only valid JSON.
Do not use markdown fences.
Only include fields that are supported by the schema.
Keep all text concise, practical, and safe for human review.
Never fabricate map geometry.
When unsure, omit the field instead of inventing details.
Use retrieval_context as the highest-priority evidence.
If retrieval_context lacks evidence for a claim, do not invent that claim.
Prefer to reuse the provided excerpts in source_basis/raw_text_excerpt rather than paraphrasing unsupported facts.

The JSON shape is:
{
  "route_patch": {
    "summary_short": string,
    "beginner_fit_reason": string,
    "transport_summary": string,
    "route_logic_summary": string,
    "exit_logic_summary": string,
    "easiest_panic_point_text": string,
    "not_for_whom_text": string,
    "best_season_text": string
  },
  "tags": [
    {
      "tag_group": string,
      "tag_code": string,
      "tag_name": string,
      "is_core": boolean,
      "sort_order": number
    }
  ],
  "faqs": [
    {
      "question": string,
      "answer": string,
      "source_basis": unknown[],
      "display_order": number
    }
  ],
  "sources": [
    {
      "source_type": "official" | "map" | "travel_note" | "video" | "local_notice",
      "source_title": string,
      "source_url": string,
      "source_summary": string,
      "credibility_score": number,
      "used_for_fields": string[],
      "raw_text_excerpt": string
    }
  ],
  "checklist_profile": {
    "duration_bucket": "half_day" | "one_day" | "long_half_day",
    "intensity_bucket": "easy" | "moderate",
    "terrain_tags": string[],
    "weather_sensitive_tags": string[],
    "mandatory_supply_codes": string[],
    "optional_supply_codes": string[],
    "emergency_supply_codes": string[],
    "checklist_note_text": string
  },
  "weather_rules": [
    {
      "scenario_type": "rain" | "thunder" | "heat" | "cold" | "wind" | "late_start",
      "severity": "warn" | "avoid",
      "rule_text": string,
      "action_text": string,
      "threshold_config": object
    }
  ]
}

Prefer Chinese content.
Keep tags to 3-6 items, faqs to 2-4 items, sources to 1-3 items, weather_rules to 2-4 items.
Use generic but plausible public-source placeholders only when source_url is unknown.
`.trim();

  const userPrompt = JSON.stringify(
    {
      route: {
        route_id: input.route_id,
        route_name: input.route_name,
        province_name: input.province_name,
        city_name: input.city_name,
        area_name: input.area_name,
        start_point_name: input.start_point_name,
        end_point_name: input.end_point_name,
        route_type: input.route_type,
        map_search_keyword: input.map_search_keyword,
      },
      modules: input.modules,
      retrieval_context: input.retrieval_context ?? { strategy: "single_route_keyword_topk", top_chunks: [] },
      task: "Generate reviewable prefill artifacts for a beginner-friendly hiking route admin workflow.",
    },
    null,
    2,
  );

  return [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: userPrompt,
    },
  ];
}

function getOpenAiCompatibleModel() {
  if (getAgentPrefillProvider() === "deepseek") {
    return process.env.AGENT_PREFILL_MODEL ?? "deepseek-chat";
  }
  if (getAgentPrefillProvider() === "qwen" || getAgentPrefillProvider() === "bailian") {
    return process.env.AGENT_PREFILL_MODEL ?? "qwen-plus";
  }
  return process.env.AGENT_PREFILL_MODEL;
}

async function requestOpenAiCompatiblePrefill(input: AgentPrefillRequest): Promise<AgentPrefillArtifacts> {
  const apiKey = getAgentPrefillApiKey();
  const apiUrl = getAgentPrefillApiUrl();
  if (!apiKey) {
    throw new Error("AGENT_PREFILL_API_KEY is not configured");
  }
  if (!apiUrl) {
    throw new Error("AGENT_PREFILL_API_URL is not configured");
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getOpenAiCompatibleModel(),
      response_format: { type: "json_object" },
      messages: buildDeepSeekMessages(input),
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(`${getAgentPrefillProvider()} prefill request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as DeepSeekChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("deepseek prefill response is empty");
  }

  const artifacts = JSON.parse(content) as AgentPrefillEnvelope;
  return normalizeEnvelope(artifacts);
}

export async function requestAgentPrefill(input: AgentPrefillRequest): Promise<AgentPrefillArtifacts> {
  if (
    getAgentPrefillProvider() === "deepseek" ||
    getAgentPrefillProvider() === "qwen" ||
    getAgentPrefillProvider() === "bailian"
  ) {
    return requestOpenAiCompatiblePrefill(input);
  }

  const apiUrl = getAgentPrefillApiUrl();
  if (!apiUrl) {
    throw new Error("AGENT_PREFILL_API_URL is not configured");
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(getAgentPrefillApiKey() ? { Authorization: `Bearer ${getAgentPrefillApiKey()}` } : {}),
    },
    body: JSON.stringify({
      ...input,
      provider: getAgentPrefillProvider(),
      model: process.env.AGENT_PREFILL_MODEL ?? undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(`agent prefill request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as AgentPrefillEnvelope;
  return normalizeEnvelope(payload);
}
