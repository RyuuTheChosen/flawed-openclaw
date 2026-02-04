import type { OpenClawConfig } from "../config/config.js";

export type LocalLlmConfigParams = {
  baseUrl: string;
  modelId: string;
  modelName: string;
  contextWindow?: number;
};

const LOCAL_LLM_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const LOCAL_LLM_CONTEXT_WINDOW = 128000;
const LOCAL_LLM_MAX_TOKENS = 8192;

export function applyLmstudioProviderConfig(
  cfg: OpenClawConfig,
  params: LocalLlmConfigParams,
): OpenClawConfig {
  const modelRef = `lmstudio/${params.modelId}`;
  const models = { ...cfg.agents?.defaults?.models };
  models[modelRef] = {
    ...models[modelRef],
    alias: models[modelRef]?.alias ?? params.modelName,
  };

  const providers = { ...cfg.models?.providers };
  const existingProvider = providers.lmstudio;
  const existingModels = Array.isArray(existingProvider?.models) ? existingProvider.models : [];
  const hasModel = existingModels.some((m) => m.id === params.modelId);
  const modelDef = {
    id: params.modelId,
    name: params.modelName,
    reasoning: false,
    input: ["text"] as Array<"text" | "image">,
    cost: LOCAL_LLM_COST,
    contextWindow: params.contextWindow ?? LOCAL_LLM_CONTEXT_WINDOW,
    maxTokens: LOCAL_LLM_MAX_TOKENS,
  };
  const mergedModels = hasModel ? existingModels : [...existingModels, modelDef];

  providers.lmstudio = {
    ...existingProvider,
    baseUrl: params.baseUrl,
    api: "openai-completions",
    models: mergedModels.length > 0 ? mergedModels : [modelDef],
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
      },
    },
    models: {
      mode: cfg.models?.mode ?? "merge",
      providers,
    },
  };
}

export function applyLmstudioConfig(
  cfg: OpenClawConfig,
  params: LocalLlmConfigParams,
): OpenClawConfig {
  const next = applyLmstudioProviderConfig(cfg, params);
  const existingModel = next.agents?.defaults?.model;
  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        model: {
          ...(existingModel && "fallbacks" in (existingModel as Record<string, unknown>)
            ? {
                fallbacks: (existingModel as { fallbacks?: string[] }).fallbacks,
              }
            : undefined),
          primary: `lmstudio/${params.modelId}`,
        },
      },
    },
  };
}

export function applyOllamaOnboardProviderConfig(
  cfg: OpenClawConfig,
  params: LocalLlmConfigParams,
): OpenClawConfig {
  const modelRef = `ollama/${params.modelId}`;
  const models = { ...cfg.agents?.defaults?.models };
  models[modelRef] = {
    ...models[modelRef],
    alias: models[modelRef]?.alias ?? params.modelName,
  };

  const providers = { ...cfg.models?.providers };
  const existingProvider = providers.ollama;
  const existingModels = Array.isArray(existingProvider?.models) ? existingProvider.models : [];
  const hasModel = existingModels.some((m) => m.id === params.modelId);
  const isReasoning =
    params.modelId.toLowerCase().includes("r1") ||
    params.modelId.toLowerCase().includes("reasoning");
  const modelDef = {
    id: params.modelId,
    name: params.modelName,
    reasoning: isReasoning,
    input: ["text"] as Array<"text" | "image">,
    cost: LOCAL_LLM_COST,
    contextWindow: params.contextWindow ?? LOCAL_LLM_CONTEXT_WINDOW,
    maxTokens: LOCAL_LLM_MAX_TOKENS,
  };
  const mergedModels = hasModel ? existingModels : [...existingModels, modelDef];

  providers.ollama = {
    ...existingProvider,
    baseUrl: params.baseUrl.endsWith("/v1") ? params.baseUrl : `${params.baseUrl}/v1`,
    api: "openai-completions",
    models: mergedModels.length > 0 ? mergedModels : [modelDef],
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
      },
    },
    models: {
      mode: cfg.models?.mode ?? "merge",
      providers,
    },
  };
}

export function applyOllamaOnboardConfig(
  cfg: OpenClawConfig,
  params: LocalLlmConfigParams,
): OpenClawConfig {
  const next = applyOllamaOnboardProviderConfig(cfg, params);
  const existingModel = next.agents?.defaults?.model;
  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        model: {
          ...(existingModel && "fallbacks" in (existingModel as Record<string, unknown>)
            ? {
                fallbacks: (existingModel as { fallbacks?: string[] }).fallbacks,
              }
            : undefined),
          primary: `ollama/${params.modelId}`,
        },
      },
    },
  };
}
