import { useState } from 'react'
import { useStore } from '../store'

export function SettingsBar() {
  const [open, setOpen] = useState(false)
  const llmProvider = useStore((s) => s.llmProvider)
  const llmApiKey = useStore((s) => s.llmApiKey)
  const llmModel = useStore((s) => s.llmModel)
  const setLLMSettings = useStore((s) => s.setLLMSettings)

  const [localProvider, setLocalProvider] = useState<'anthropic' | 'openai'>(
    llmProvider ?? 'anthropic',
  )
  const [localKey, setLocalKey] = useState(llmApiKey)
  const [localModel, setLocalModel] = useState(llmModel)

  function handleSave() {
    setLLMSettings(localProvider, localKey, localModel)
    setOpen(false)
  }

  return (
    <>
      {/* Gear icon button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 z-50 w-10 h-10 border border-[var(--panel-border)] bg-[rgba(24,31,34,0.9)] backdrop-blur-sm flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent-cyan)] hover:border-[var(--accent-cyan)] transition-colors"
        aria-label="Settings"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-[rgba(1,2,3,0.7)]"
            onClick={() => setOpen(false)}
          />

          {/* Dialog */}
          <div className="relative glass-panel corner-accents w-[380px] p-6 z-10">
            <h3 className="text-[12px] font-medium uppercase tracking-[0.15em] text-[var(--text-primary)] mb-5">
              LLM Settings
            </h3>

            {/* Provider selector */}
            <label className="block text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)] mb-1">Provider</label>
            <select
              value={localProvider}
              onChange={(e) =>
                setLocalProvider(e.target.value as 'anthropic' | 'openai')
              }
              className="w-full mb-4 px-3 py-2 bg-transparent border-b border-[var(--panel-border)] text-[var(--text-primary)] text-[13px] focus:outline-none focus:border-[var(--accent-cyan)] appearance-none cursor-pointer"
            >
              <option value="anthropic" className="bg-[var(--panel-bg)]">Anthropic</option>
              <option value="openai" className="bg-[var(--panel-bg)]">OpenAI</option>
            </select>

            {/* API Key */}
            <label className="block text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)] mb-1">API Key</label>
            <input
              type="password"
              value={localKey}
              onChange={(e) => setLocalKey(e.target.value)}
              placeholder={
                localProvider === 'anthropic'
                  ? 'sk-ant-...'
                  : 'sk-...'
              }
              className="w-full mb-4 px-3 py-2 bg-transparent border-b border-[var(--panel-border)] text-[var(--text-primary)] text-[13px] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)]"
            />

            {/* Model */}
            <label className="block text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)] mb-1">
              Model{' '}
              <span className="text-[var(--text-muted)]" style={{ opacity: 0.5 }}>
                (default:{' '}
                {localProvider === 'anthropic'
                  ? 'claude-sonnet-4-5-20250929'
                  : 'gpt-4o-mini'}
                )
              </span>
            </label>
            <input
              type="text"
              value={localModel}
              onChange={(e) => setLocalModel(e.target.value)}
              placeholder={
                localProvider === 'anthropic'
                  ? 'claude-sonnet-4-5-20250929'
                  : 'gpt-4o-mini'
              }
              className="w-full mb-6 px-3 py-2 bg-transparent border-b border-[var(--panel-border)] text-[var(--text-primary)] text-[13px] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)]"
            />

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-[11px] uppercase tracking-[0.15em] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 border border-[var(--accent-cyan)] text-[var(--accent-cyan)] text-[11px] uppercase tracking-[0.15em] font-medium hover:bg-[rgba(0,229,255,0.08)] transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
