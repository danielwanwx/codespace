import { useEffect } from 'react'
import { GraphView } from './components/GraphView'
import { Header } from './components/Header'
import { SearchBar } from './components/SearchBar'
import { SettingsBar } from './components/SettingsBar'
import { SidePanel } from './components/SidePanel'
import { ZoomToolbar } from './components/ZoomToolbar'
import { useStore } from './store'

function App() {
  const setGraph = useStore((s) => s.setGraph)
  const graph = useStore((s) => s.graph)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const graphUrl = params.get('graph') || './codespace_graph.json'
    fetch(graphUrl)
      .then((r) => r.json())
      .then(setGraph)
  }, [setGraph])

  const repoName = graph?.metadata?.repos?.[0] ?? ''

  return (
    <div className="h-screen w-screen bg-gray-950 text-white flex flex-col">
      <Header repoName={repoName} />
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 relative">
          <GraphView />
          <ZoomToolbar />
          <SearchBar />
        </div>
        <SidePanel />
      </div>
      <SettingsBar />
    </div>
  )
}

export default App
