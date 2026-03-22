export function Header({ repoName }: { repoName: string }) {
  return (
    <div className="h-12 bg-gray-900 border-b border-gray-800 flex items-center px-4 shrink-0">
      <span className="text-lg font-semibold text-white">Codespace</span>
      <span className="mx-2 text-gray-600">&middot;</span>
      <span className="text-gray-400">{repoName}</span>
    </div>
  )
}
