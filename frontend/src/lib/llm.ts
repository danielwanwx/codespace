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
  provider: 'anthropic' | 'openai',
  apiKey: string,
  model: string,
  context: ExplainContext,
): Promise<string> {
  const prompt = buildPrompt(context)

  if (provider === 'anthropic') {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-5-20250929',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await resp.json()
    return data.content?.[0]?.text || 'No explanation generated.'
  }

  if (provider === 'openai') {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await resp.json()
    return data.choices?.[0]?.message?.content || 'No explanation generated.'
  }

  return 'Unsupported provider.'
}

export async function explainModule(
  provider: 'anthropic' | 'openai',
  apiKey: string,
  model: string,
  context: ModuleExplainContext,
): Promise<string> {
  const prompt = buildModulePrompt(context)

  if (provider === 'anthropic') {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-5-20250929',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await resp.json()
    return data.content?.[0]?.text || 'No explanation generated.'
  }

  if (provider === 'openai') {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await resp.json()
    return data.choices?.[0]?.message?.content || 'No explanation generated.'
  }

  return 'Unsupported provider.'
}

function buildModulePrompt(context: ModuleExplainContext): string {
  return `Explain what this module does in 2-3 sentences, focusing on its purpose and how it fits in the codebase.

Module: ${context.moduleName}
Path: ${context.path}
Files: ${context.fileCount}
Contains: ${context.symbols.slice(0, 20).join(', ') || 'none'}${context.symbols.length > 20 ? '...' : ''}
Depends on: ${context.outgoing.join(', ') || 'none'}
Used by: ${context.incoming.join(', ') || 'none'}
${context.globalContext ? `\nProject context: ${context.globalContext}` : ''}

Respond with a clear, concise explanation. No markdown headers.`
}

function buildPrompt(context: ExplainContext): string {
  return `Explain what this function does in 2-3 sentences, focusing on its purpose and how it fits in the codebase.

Function: ${context.signature}
${context.docstring ? `Docstring: ${context.docstring}` : ''}
Module: ${context.moduleName}
Calls: ${context.calls.join(', ') || 'none'}
Called by: ${context.calledBy.join(', ') || 'none'}
${context.globalContext ? `\nProject context: ${context.globalContext}` : ''}

Respond with a clear, concise explanation. No markdown headers.`
}
