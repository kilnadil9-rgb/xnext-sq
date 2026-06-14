import { Link } from 'react-router-dom'

export function CommunityGuidelinesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-sm leading-relaxed text-foreground">
      <div className="mb-8">
        <Link to="/dashboard" className="text-xs text-muted-foreground hover:underline">← Back to XNEXT</Link>
        <h1 className="mt-3 text-3xl font-bold">Community Guidelines</h1>
      </div>

      <p className="mb-6">XNEXT exists for discovery, wonder, and real-world experiences. Help keep it a positive, respectful place.</p>

      <div className="space-y-5">
        <div>
          <h3 className="font-semibold">Be respectful</h3>
          <p>Treat other users, land owners, and communities with kindness. No harassment, hate speech, or doxxing.</p>
        </div>
        <div>
          <h3 className="font-semibold">Leave no trace</h3>
          <p>Follow Leave No Trace principles. Do not trespass. Obtain permission where required. Pack out everything you pack in.</p>
        </div>
        <div>
          <h3 className="font-semibold">Be accurate</h3>
          <p>When creating Quests or writing Memories, be truthful. Clearly note difficulty, access requirements, and any risks.</p>
        </div>
        <div>
          <h3 className="font-semibold">Protect privacy</h3>
          <p>Do not share other people's personal information or photos without consent. Default to private for personal Memories.</p>
        </div>
        <div>
          <h3 className="font-semibold">Report problems</h3>
          <p>Use in-app reporting or Contact Support if you see content or behavior that violates these guidelines or the law.</p>
        </div>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">Violations may result in content removal or account suspension. Thank you for helping make XNEXT a trusted space for adventure.</p>
    </div>
  )
}
