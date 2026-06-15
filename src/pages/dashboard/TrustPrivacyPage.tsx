/**
 * TrustPrivacyPage — /dashboard/trust
 *
 * Hub page surfacing all existing legal/privacy pages from one premium destination.
 * All linked pages already exist — this is routing + UX, not new legal content.
 *
 * Reused routes:
 *   /privacy-policy        PrivacyPolicyPage
 *   /terms-of-service      TermsOfServicePage
 *   /community-guidelines  CommunityGuidelinesPage
 *   /philosophy            ProductPhilosophyPage
 *   /data-requests         DataRequestsPage
 *   /consent               ConsentPage
 */
import { Link } from 'react-router-dom'

interface TrustItem {
  icon: string
  title: string
  description: string
  href: string
  external?: boolean
}

const TRUST_ITEMS: TrustItem[] = [
  {
    icon: '🔒',
    title: 'Privacy Policy',
    description: 'What we collect, why, and your rights under GDPR, CCPA, and WA law.',
    href: '/privacy-policy',
  },
  {
    icon: '📋',
    title: 'Terms of Service',
    description: 'The rules of the road — your rights and responsibilities as an XNEXT member.',
    href: '/terms-of-service',
  },
  {
    icon: '🤝',
    title: 'Community Guidelines',
    description: 'How we keep XNEXT honest, safe, and free of commercial noise.',
    href: '/community-guidelines',
  },
  {
    icon: '✦',
    title: 'Product Philosophy',
    description: 'Why we built XNEXT this way and what we refuse to compromise on.',
    href: '/philosophy',
  },
  {
    icon: '🗂',
    title: 'Privacy Consent',
    description: 'Review or update the privacy and terms acceptance you gave at sign-up.',
    href: '/consent',
  },
  {
    icon: '📤',
    title: 'Data Requests',
    description: 'Download your data, export memories, or permanently delete your account.',
    href: '/data-requests',
  },
]

export function TrustPrivacyPage() {
  return (
    <div className="mx-auto max-w-lg">

      {/* ── Page header ───────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          {/* Orange accent mark */}
          <div className="w-1 h-6 rounded-full bg-[#f97316]" />
          <h1 className="text-xl font-bold text-foreground">Trust & Privacy</h1>
        </div>
        <p className="text-sm text-muted-foreground pl-3">
          Your memories belong to you. Your data belongs to you. Full stop.
        </p>
      </div>

      {/* ── Link cards ────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {TRUST_ITEMS.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className="group flex items-center gap-3.5 rounded-xl border border-border bg-card px-4 py-3.5 transition-all hover:border-[#f97316]/50 hover:bg-[#f97316]/[0.04] active:scale-[0.99]"
          >
            {/* Icon */}
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-lg flex-shrink-0 group-hover:bg-[#f97316]/10 transition-colors">
              {item.icon}
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground leading-tight">
                {item.title}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
                {item.description}
              </div>
            </div>

            {/* Arrow */}
            <svg
              className="w-4 h-4 text-muted-foreground/40 flex-shrink-0 group-hover:text-[#f97316]/60 group-hover:translate-x-0.5 transition-all"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        ))}
      </div>

      {/* ── Footer note ───────────────────────────────────────────────── */}
      <div className="mt-8 rounded-xl border border-border bg-card px-4 py-3">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">Questions?</span>{' '}
          Email{' '}
          <a
            href="mailto:privacy@xnext.example"
            className="underline text-[#f97316] hover:text-[#f97316]/80"
          >
            privacy@xnext.example
          </a>
          . XNEXT respects GDPR, CCPA, and Washington State consumer privacy law. You can
          export or delete your data at any time with no waiting period.
        </p>
      </div>
    </div>
  )
}
