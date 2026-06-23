import { Link } from 'react-router-dom'

export function DataRequestsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/dashboard" className="text-xs text-muted-foreground hover:underline">← Back</Link>
      <h1 className="mt-3 text-2xl font-bold">Data Requests</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        For access, deletion, correction, or other privacy requests, use the tools in{' '}
        <Link to="/dashboard/settings" className="underline">Settings → Privacy &amp; Data</Link>:
      </p>
      <ul className="mt-3 list-disc pl-5 text-sm space-y-1">
        <li>Download My Data</li>
        <li>Export Memories / Dream List</li>
        <li>Delete Account (with 30-day recovery window)</li>
      </ul>
      <p className="mt-4 text-sm">
        For assistance beyond self-service tools, email <a href="mailto:privacy@xnext.app" className="underline">privacy@xnext.app</a> or use Contact Support in the footer.
      </p>
      <p className="mt-6 text-xs text-muted-foreground">XNEXT honors GDPR, CCPA, and Washington consumer privacy rights.</p>
    </div>
  )
}
