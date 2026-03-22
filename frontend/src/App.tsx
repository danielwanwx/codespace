import { useEffect } from 'react'
import { GraphView } from './components/GraphView'
import { useStore } from './store'

function App() {
  const setGraph = useStore((s) => s.setGraph)

  useEffect(() => {
    fetch('/sample_graph.json')
      .then((r) => r.json())
      .then(setGraph)
  }, [setGraph])

  return (
    <div className="h-screen w-screen bg-gray-950 text-white flex">
      <div className="flex-1">
        <GraphView />
      </div>
    </div>
  )
}

export default App
