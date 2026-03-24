// ── Provider registry ──────────────────────────────────────

export interface ProviderConfig {
  label: string
  models: { id: string; label: string }[]
  baseUrl: string
  format: 'anthropic' | 'openai-compat'
  keyPlaceholder: string
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  anthropic: {
    label: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
      { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
      { id: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5' },
    ],
    baseUrl: 'https://api.anthropic.com/v1/messages',
    format: 'anthropic',
    keyPlaceholder: 'sk-ant-...',
  },
  openai: {
    label: 'OpenAI',
    models: [
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
      { id: 'gpt-5.4', label: 'GPT-5.4' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'o4-mini', label: 'o4-mini' },
      { id: 'o3', label: 'o3' },
      { id: 'o3-mini', label: 'o3-mini' },
    ],
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    format: 'openai-compat',
    keyPlaceholder: 'sk-...',
  },
  deepseek: {
    label: 'DeepSeek',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek V3.2' },
      { id: 'deepseek-reasoner', label: 'DeepSeek R1 (V3.2 Thinking)' },
    ],
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    format: 'openai-compat',
    keyPlaceholder: 'sk-...',
  },
  google: {
    label: 'Google Gemini',
    models: [
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
      { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
      { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    ],
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    format: 'openai-compat',
    keyPlaceholder: 'AIza...',
  },
  'minimax-cn': {
    label: 'MiniMax (China)',
    models: [
      { id: 'MiniMax-M2.7', label: 'MiniMax M2.7' },
      { id: 'MiniMax-M2.5', label: 'MiniMax M2.5' },
      { id: 'MiniMax-M2.1', label: 'MiniMax M2.1' },
      { id: 'minimax-text-01', label: 'MiniMax-Text-01 (456B)' },
      { id: 'abab7-chat-preview', label: 'ABAB 7 Preview' },
      { id: 'abab6.5s-chat', label: 'ABAB 6.5s' },
    ],
    baseUrl: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
    format: 'openai-compat',
    keyPlaceholder: 'eyJ...',
  },
  'minimax-global': {
    label: 'MiniMax (Global)',
    models: [
      { id: 'MiniMax-M2.7', label: 'MiniMax M2.7' },
      { id: 'MiniMax-M2.5', label: 'MiniMax M2.5' },
      { id: 'MiniMax-M2.1', label: 'MiniMax M2.1' },
      { id: 'minimax-text-01', label: 'MiniMax-Text-01 (456B)' },
      { id: 'abab7-chat-preview', label: 'ABAB 7 Preview' },
      { id: 'abab6.5s-chat', label: 'ABAB 6.5s' },
    ],
    baseUrl: 'https://api.minimaxi.chat/v1/text/chatcompletion_v2',
    format: 'openai-compat',
    keyPlaceholder: 'eyJ...',
  },
  moonshot: {
    label: 'Moonshot / Kimi',
    models: [
      { id: 'kimi-k2.5', label: 'Kimi K2.5' },
      { id: 'kimi-k2-thinking', label: 'Kimi K2 Thinking' },
      { id: 'kimi-k2-thinking-turbo', label: 'Kimi K2 Thinking Turbo' },
      { id: 'moonshot-v1-auto', label: 'Moonshot v1 Auto' },
      { id: 'moonshot-v1-128k', label: 'Moonshot v1 128K' },
      { id: 'moonshot-v1-32k', label: 'Moonshot v1 32K' },
    ],
    baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
    format: 'openai-compat',
    keyPlaceholder: 'sk-...',
  },
  zhipu: {
    label: 'Zhipu / GLM',
    models: [
      { id: 'glm-4.7', label: 'GLM-4.7' },
      { id: 'glm-4.7-flash', label: 'GLM-4.7 Flash (Free)' },
      { id: 'glm-4.7-flashx', label: 'GLM-4.7 FlashX' },
      { id: 'glm-4.5', label: 'GLM-4.5' },
      { id: 'glm-4-plus', label: 'GLM-4 Plus' },
      { id: 'glm-4-flash', label: 'GLM-4 Flash' },
      { id: 'glm-4-long', label: 'GLM-4 Long' },
    ],
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    format: 'openai-compat',
    keyPlaceholder: 'your-api-key',
  },
  qwen: {
    label: 'Qwen / Tongyi',
    models: [
      { id: 'qwen3-max', label: 'Qwen3 Max' },
      { id: 'qwen3.5-plus', label: 'Qwen3.5 Plus' },
      { id: 'qwen3.5-flash', label: 'Qwen3.5 Flash' },
      { id: 'qwen-max', label: 'Qwen Max' },
      { id: 'qwen-plus', label: 'Qwen Plus' },
      { id: 'qwen-turbo', label: 'Qwen Turbo' },
      { id: 'qwen-long', label: 'Qwen Long' },
    ],
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    format: 'openai-compat',
    keyPlaceholder: 'sk-...',
  },
  doubao: {
    label: 'Doubao / ByteDance',
    models: [
      { id: 'doubao-seed-2-0-pro-260215', label: 'Seed 2.0 Pro' },
      { id: 'doubao-seed-2-0-lite-260215', label: 'Seed 2.0 Lite' },
      { id: 'doubao-seed-2-0-mini-260215', label: 'Seed 2.0 Mini' },
      { id: 'doubao-seed-code', label: 'Seed Code' },
      { id: 'doubao-seed-1-6-251015', label: 'Seed 1.6' },
      { id: 'doubao-1-5-pro-32k-250115', label: 'Doubao 1.5 Pro 32K' },
      { id: 'doubao-1-5-lite-32k-250115', label: 'Doubao 1.5 Lite 32K' },
    ],
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    format: 'openai-compat',
    keyPlaceholder: 'your-api-key',
  },
}

export type ProviderId = keyof typeof PROVIDERS

// ── API call ───────────────────────────────────────────────

async function callLLM(
  providerId: string,
  apiKey: string,
  model: string,
  prompt: string,
): Promise<string> {
  const cfg = PROVIDERS[providerId]
  if (!cfg) return 'Unsupported provider.'

  const selectedModel = model || cfg.models[0]?.id || ''

  if (cfg.format === 'anthropic') {
    const resp = await fetch(cfg.baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!resp.ok) {
      const err = await resp.text()
      throw new Error(`Anthropic API error ${resp.status}: ${err}`)
    }
    const data = await resp.json()
    return data.content?.[0]?.text || 'No explanation generated.'
  }

  // OpenAI-compatible format (used by most providers)
  const resp = await fetch(cfg.baseUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: selectedModel,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`${cfg.label} API error ${resp.status}: ${err}`)
  }
  const data = await resp.json()
  return data.choices?.[0]?.message?.content || 'No explanation generated.'
}

// ── Public API ─────────────────────────────────────────────

interface ExplainContext {
  signature: string
  docstring: string
  calls: string[]
  calledBy: string[]
  moduleName: string
  globalContext: string
}

interface ModuleExplainContext {
  moduleName: string
  path: string
  symbols: string[]
  fileCount: number
  outgoing: string[]
  incoming: string[]
  globalContext: string
}

export async function explainFunction(
  provider: string,
  apiKey: string,
  model: string,
  context: ExplainContext,
): Promise<string> {
  return callLLM(provider, apiKey, model, buildPrompt(context))
}

export async function explainModule(
  provider: string,
  apiKey: string,
  model: string,
  context: ModuleExplainContext,
): Promise<string> {
  return callLLM(provider, apiKey, model, buildModulePrompt(context))
}

function buildModulePrompt(context: ModuleExplainContext): string {
  return `Analyze this module and provide a structured explanation in markdown format.

Module: ${context.moduleName}
Path: ${context.path}
Files: ${context.fileCount}
Contains: ${context.symbols.slice(0, 30).join(', ') || 'none'}${context.symbols.length > 30 ? '...' : ''}
Depends on: ${context.outgoing.join(', ') || 'none'}
Used by: ${context.incoming.join(', ') || 'none'}
${context.globalContext ? `\nProject context: ${context.globalContext}` : ''}

Respond in this markdown structure:

**Purpose:** One paragraph explaining what this module does and its role in the codebase.

**Key Components:**
- List the most important symbols and what each does (3-5 items)

**Dependencies:**
- Explain why it depends on other modules and how it serves modules that use it

**Architecture Notes:**
Any important design patterns, caveats, or architectural decisions.`
}

function buildPrompt(context: ExplainContext): string {
  return `Analyze this function and provide a structured explanation in markdown format.

Function: ${context.signature}
${context.docstring ? `Docstring: ${context.docstring}` : ''}
Module: ${context.moduleName}
Calls: ${context.calls.join(', ') || 'none'}
Called by: ${context.calledBy.join(', ') || 'none'}
${context.globalContext ? `\nProject context: ${context.globalContext}` : ''}

Respond in this markdown structure:

**Purpose:** One paragraph explaining what this function does and why it exists.

**How it works:**
Step-by-step explanation of the function's logic and behavior.

**Integration:**
How this function fits into the broader codebase — what calls it, what it depends on, and its role in the data/control flow.`
}
