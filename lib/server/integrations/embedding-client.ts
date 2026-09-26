/**
 * embedding-client.ts —— 百炼 text-embedding-v3 向量化客户端（阶段 2）
 *
 * 与 agent-prefill 共用 DashScope 通道（AGENT_PREFILL_API_KEY），
 * 走 OpenAI 兼容 /v1/embeddings 端点。单批上限 10 条（百炼硬限制）。
 */

const EMBED_MODEL = "text-embedding-v3";
const EMBED_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings";
const BATCH = 10;

export function isEmbeddingConfigured(): boolean {
  return Boolean(process.env.AGENT_PREFILL_API_KEY);
}

type EmbeddingResponse = {
  data: Array<{ index: number; embedding: number[] }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
};

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.AGENT_PREFILL_API_KEY;
  if (!apiKey) {
    throw new Error("AGENT_PREFILL_API_KEY 未配置，无法调用百炼 embedding");
  }
  if (texts.length === 0) {
    return [];
  }

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const resp = await fetch(EMBED_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: batch }),
      cache: "no-store",
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      throw new Error(`百炼 embedding 请求失败 ${resp.status}: ${detail.slice(0, 200)}`);
    }
    const payload = (await resp.json()) as EmbeddingResponse;
    const ordered = [...payload.data].sort((a, b) => a.index - b.index);
    for (const item of ordered) {
      out.push(item.embedding);
    }
  }
  return out;
}
