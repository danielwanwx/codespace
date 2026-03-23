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
        className="fixed bottom-4 right-4 z-50 w-10 h-10 border border-[rgba(0,0,0,0.1)] bg-white flex items-center justify-center text-[rgba(0,0,0,0.3)] hover:text-[#111] hover:border-[rgba(0,0,0,0.25)] transition-colors"
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
            className="absolute inset-0 bg-[rgba(0,0,0,0.15)]"
            onClick={() => setOpen(false)}
          />

          {/* Dialog */}
          <div className="relative bg-white border border-[rgba(0,0,0,0.1)] w-[380px] p-6 z-10 shadow-lg">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.15em] text-[#111] mb-5">
              LLM Settings
            </h3>

            {/* Provider selector */}
            <label className="block text-[11px] uppercase tracking-[0.1em] text-[rgba(0,0,0,0.35)] mb-1">Provider</label>
            <select
              value={localProvider}
              onChange={(e) =>
                setLocalProvider(e.target.value as 'anthropic' | 'openai')
              }
              className="w-full mb-4 px-3 py-2 bg-transparent border-b border-[rgba(0,0,0,0.1)] text-[#111] text-[13px] focus:outline-none focus:border-[#111] appearance-none cursor-pointer"
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>

            {/* API Key */}
            <label className="block text-[11px] uppercase tracking-[0.1em] text-[rgba(0,0,0,0.35)] mb-1">API Key</label>
            <input
              type="password"
              value={localKey}
              onChange={(e) => setLocalKey(e.target.value)}
              placeholder={
                localProvider === 'anthropic'
                  ? 'sk-ant-...'
                  : 'sk-...'
              }
              className="w-full mb-4 px-3 py-2 bg-transparent border-b border-[rgba(0,0,0,0.1)] text-[#111] text-[13px] placeholder:text-[rgba(0,0,0,0.2)] focus:outline-none focus:border-[#111]"
            />

            {/* Model */}
            <label className="block text-[11px] uppercase tracking-[0.1em] text-[rgba(0,0,0,0.35)] mb-1">
              Model{' '}
              <span style={{ opacity: 0.5 }}>
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
              className="w-full mb-6 px-3 py-2 bg-transparent border-b border-[rgba(0,0,0,0.1)] text-[#111] text-[13px] placeholder:text-[rgba(0,0,0,0.2)] focus:outline-none focus:border-[#111]"
            />

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-[11px] uppercase tracking-[0.15em] text-[rgba(0,0,0,0.35)] hover:text-[#111] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2 bg-[#111] text-white text-[11px] uppercase tracking-[0.15em] font-medium hover:opacity-80 transition-opacity"
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
