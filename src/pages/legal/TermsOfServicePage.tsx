import { Link } from 'react-router-dom'

export function TermsOfServicePage() {
  const effective = 'June 2026'
  const version = '2026-06-01'

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-sm leading-relaxed text-foreground">
      <div className="mb-8">
        <Link to="/dashboard" className="text-xs text-muted-foreground hover:underline">← Back to XNEXT</Link>
        <h1 className="mt-3 text-3xl font-bold">Terms of Service</h1>
        <p className="mt-1 text-muted-foreground">Effective {effective} • Version {version}</p>
      </div>

      <p className="mb-6">By using XNEXT you agree to these Terms. Please read them carefully.</p>

      <section className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-2">1. User Responsibilities</h2>
          <p>You are responsible for maintaining the security of your account, for all activity under it, and for providing accurate information. You must be at least 18 (or the age of majority in your jurisdiction) to use XNEXT.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">2. Community Standards</h2>
          <p>
            XNEXT is a place for real-world adventure, wonder, and positive connection. Do not post illegal, hateful, harassing, or intentionally misleading content.
            Respect private property and local laws when participating in Quests. Report violations via the in-app tools or support.
            We may remove content or suspend accounts that violate these standards.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">3. Liability Limitations</h2>
          <p>
            XNEXT surfaces user-generated and curated experiences ("Quests"). We do not operate the physical locations or events.
            Participation is entirely at your own risk. To the maximum extent permitted by law, XNEXT and its creators are not liable for any injury, loss, or damage arising from use of the service or from experiences discovered through it.
            Always use good judgment, verify conditions, and follow local laws and land owner rules.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">4. Experience Participation Disclaimers</h2>
          <p>
            Quests may involve physical activity, travel, weather exposure, or interaction with the public and natural environments.
            Some experiences have inherent risks. XNEXT provides discovery tools only. We do not certify safety or suitability of any Quest.
            Check requirements, obtain any needed permissions or tickets, and prepare appropriately.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">5. User-Generated Content Ownership</h2>
          <p>
            You retain ownership of the content you create (Quest submissions you author, stories and photos in Memories, notes on Dream List items).
            By posting you grant XNEXT a non-exclusive, royalty-free license to display, host, and distribute that content within the service for the purpose of operating XNEXT.
            You may delete your content at any time (subject to the retention rules in the Privacy Policy).
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">6. Account Termination</h2>
          <p>
            You may delete your account at any time via Privacy Settings (see 30-day recovery window in Privacy Policy).
            We may suspend or terminate accounts that violate these Terms, abuse the service, or for legal compliance reasons.
            Upon termination, your right to access the service ends and we will process your data according to the Privacy Policy (immediate purge of most content + anonymization of logs).
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">7. Changes to Terms</h2>
          <p>We may update these Terms and the Privacy Policy. Material changes will be announced in-app or via email to the address on file. Continued use after changes constitutes acceptance.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">8. Contact</h2>
          <p>Questions about these Terms: support@xnext.example or the Contact Support link in the Trust Center.</p>
        </div>

        <div className="pt-4 text-xs text-muted-foreground border-t">
          XNEXT — real adventures, your data, your control.
        </div>
      </section>
    </div>
  )
}
