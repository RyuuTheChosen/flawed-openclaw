import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { resolveOpenClawAgentDir } from "../agents/agent-paths.js";
import { upsertAuthProfile } from "../agents/auth-profiles.js";
import { applyLmstudioConfig, applyOllamaOnboardConfig } from "./onboard-auth.config-local-llm.js";

const LMSTUDIO_DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1";
const OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434";

interface LmStudioModel {
  id: string;
  object?: string;
  owned_by?: string;
}

interface LmStudioModelsResponse {
  data: LmStudioModel[];
}

interface OllamaModel {
  name: string;
  modified_at?: string;
  size?: number;
}

interface OllamaTagsResponse {
  models: OllamaModel[];
}

async function discoverLmStudioModels(baseUrl: string): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/models`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as LmStudioModelsResponse;
    if (!data.data || data.data.length === 0) {
      return [];
    }
    return data.data.map((m) => m.id);
  } catch {
    return [];
  }
}

async function discoverOllamaModelsForOnboard(baseUrl: string): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as OllamaTagsResponse;
    if (!data.models || data.models.length === 0) {
      return [];
    }
    return data.models.map((m) => m.name);
  } catch {
    return [];
  }
}

export async function applyAuthChoiceLocalLlm(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "lmstudio" && params.authChoice !== "ollama") {
    return null;
  }

  let nextConfig = params.config;

  if (params.authChoice === "lmstudio") {
    await params.prompter.note("Make sure LM Studio is running with a model loaded.", "LM Studio");

    const baseUrl = await params.prompter.text({
      message: "LM Studio base URL",
      initialValue: LMSTUDIO_DEFAULT_BASE_URL,
    });

    const progress = params.prompter.progress("Discovering models…");
    const modelIds = await discoverLmStudioModels(baseUrl);
    progress.stop();

    let modelId: string;
    if (modelIds.length > 0) {
      modelId = await params.prompter.select({
        message: "Select a model",
        options: modelIds.map((id) => ({ value: id, label: id })),
      });
    } else {
      await params.prompter.note(
        "Could not reach LM Studio or no models loaded.\nYou can enter a model ID manually.",
        "No models found",
      );
      modelId = await params.prompter.text({
        message: "Enter model ID",
        validate: (v) => (v?.trim() ? undefined : "Required"),
      });
    }

    const contextWindow = await params.prompter.select({
      message: "Context window (must match LM Studio setting)",
      options: [
        { value: 4096, label: "4096", hint: "LM Studio default" },
        { value: 8192, label: "8192" },
        { value: 16384, label: "16384" },
        { value: 32768, label: "32768" },
        { value: 65536, label: "65536" },
        { value: 131072, label: "131072", hint: "128K" },
      ],
      initialValue: 4096,
    });

    const agentDir = params.agentDir ?? resolveOpenClawAgentDir();
    upsertAuthProfile({
      profileId: "lmstudio:default",
      credential: {
        type: "api_key",
        provider: "lmstudio",
        key: "lmstudio",
      },
      agentDir,
    });

    nextConfig = applyLmstudioConfig(nextConfig, {
      baseUrl,
      modelId: modelId.trim(),
      modelName: modelId.trim(),
      contextWindow,
    });

    const modelRef = `lmstudio/${modelId.trim()}`;
    if (params.setDefaultModel) {
      await params.prompter.note(`Default model set to ${modelRef}`, "Model configured");
    }

    return {
      config: nextConfig,
      agentModelOverride: params.setDefaultModel ? undefined : modelRef,
    };
  }

  // Ollama flow
  await params.prompter.note("Make sure Ollama is running.", "Ollama");

  const baseUrl = await params.prompter.text({
    message: "Ollama base URL",
    initialValue: OLLAMA_DEFAULT_BASE_URL,
  });

  const progress = params.prompter.progress("Discovering models…");
  const modelIds = await discoverOllamaModelsForOnboard(baseUrl);
  progress.stop();

  let modelId: string;
  if (modelIds.length > 0) {
    modelId = await params.prompter.select({
      message: "Select a model",
      options: modelIds.map((id) => ({ value: id, label: id })),
    });
  } else {
    await params.prompter.note(
      "Could not reach Ollama or no models pulled.\nYou can enter a model ID manually.",
      "No models found",
    );
    modelId = await params.prompter.text({
      message: "Enter model ID",
      validate: (v) => (v?.trim() ? undefined : "Required"),
    });
  }

  const contextWindow = await params.prompter.select({
    message: "Context window (must match Ollama num_ctx)",
    options: [
      { value: 4096, label: "4096", hint: "Ollama default" },
      { value: 8192, label: "8192" },
      { value: 16384, label: "16384" },
      { value: 32768, label: "32768" },
      { value: 65536, label: "65536" },
      { value: 131072, label: "131072", hint: "128K" },
    ],
    initialValue: 4096,
  });

  const agentDir = params.agentDir ?? resolveOpenClawAgentDir();
  upsertAuthProfile({
    profileId: "ollama:default",
    credential: {
      type: "api_key",
      provider: "ollama",
      key: "ollama-local",
    },
    agentDir,
  });

  nextConfig = applyOllamaOnboardConfig(nextConfig, {
    baseUrl,
    modelId: modelId.trim(),
    modelName: modelId.trim(),
    contextWindow,
  });

  const modelRef = `ollama/${modelId.trim()}`;
  if (params.setDefaultModel) {
    await params.prompter.note(`Default model set to ${modelRef}`, "Model configured");
  }

  return { config: nextConfig, agentModelOverride: params.setDefaultModel ? undefined : modelRef };
}
