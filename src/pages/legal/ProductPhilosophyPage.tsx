import { Link } from 'react-router-dom'

export function ProductPhilosophyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-sm leading-relaxed text-foreground">
      <div className="mb-8">
        <Link to="/dashboard" className="text-xs text-muted-foreground hover:underline">← Back to XNEXT</Link>
        <h1 className="mt-3 text-3xl font-bold">Product Philosophy</h1>
      </div>

      <div className="prose prose-sm max-w-none text-foreground">
        <p className="text-base">XNEXT is not a social network. It is not a feed. It is not a map-first exploration app.</p>

        <p>It is a daily awareness layer for the things that matter in your real life — the opportunities, deadlines, seasonal windows, and people moments you would otherwise miss.</p>

        <p className="mt-4 font-medium">Your memories belong to you. Your adventures belong to you. You can export or delete your data at any time.</p>

        <p className="mt-4">We optimize for:</p>
        <ul className="list-disc pl-5">
          <li><strong>Signal over noise</strong> — Pulse alerts only when the SQ score and timing justify interrupting you.</li>
          <li><strong>Memory as the moat</strong> — The graph of what you have actually experienced is more valuable than any recommendation algorithm.</li>
          <li><strong>Privacy by default</strong> — Location is opt-in and never sold. Dream Lists and Memories are yours. Deletion is one click with a recovery window.</li>
          <li><strong>Real-world first</strong> — The product exists to get you outside, not keep you scrolling.</li>
        </ul>

        <p className="mt-6 text-xs text-muted-foreground">Built in service of presence, not addiction. If a feature would require massive network effects to be useful, we do not build it in Phase 1.</p>
      </div>
    </div>
  )
}
