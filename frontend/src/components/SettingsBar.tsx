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
        className="fixed bottom-4 right-4 z-50 w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-colors shadow-lg"
        aria-label="Settings"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
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
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />

          {/* Dialog */}
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[380px] p-6 z-10">
            <h3 className="text-lg font-semibold text-white mb-4">
              LLM Settings
            </h3>

            {/* Provider selector */}
            <label className="block text-sm text-gray-400 mb-1">Provider</label>
            <select
              value={localProvider}
              onChange={(e) =>
                setLocalProvider(e.target.value as 'anthropic' | 'openai')
              }
              className="w-full mb-4 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>

            {/* API Key */}
            <label className="block text-sm text-gray-400 mb-1">API Key</label>
            <input
              type="password"
              value={localKey}
              onChange={(e) => setLocalKey(e.target.value)}
              placeholder={
                localProvider === 'anthropic'
                  ? 'sk-ant-...'
                  : 'sk-...'
              }
              className="w-full mb-4 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
            />

            {/* Model */}
            <label className="block text-sm text-gray-400 mb-1">
              Model{' '}
              <span className="text-gray-600">
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
              className="w-full mb-6 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
            />

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
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
