import { Link } from 'react-router-dom'

export function PrivacyPolicyPage() {
  const effective = 'June 2026'
  const version = '2026-06-01'

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-sm leading-relaxed text-foreground">
      <div className="mb-8">
        <Link to="/dashboard" className="text-xs text-muted-foreground hover:underline">← Back to XNEXT</Link>
        <h1 className="mt-3 text-3xl font-bold">Privacy Policy</h1>
        <p className="mt-1 text-muted-foreground">Effective {effective} • Version {version}</p>
      </div>

      <p className="mb-6">
        XNEXT Trust &amp; Privacy Foundation. We built XNEXT to be privacy-first from day one.
        This policy explains what we collect, how we use it, and the strong rights you have under
        GDPR, CCPA, and Washington State privacy law.
      </p>

      <section className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-2">1. Account Information We Collect</h2>
          <p>When you create an account we collect email and (optionally) full name, username, bio, website, and avatar. This is used to identify you, personalize your experience, and provide core features such as saving Dream Lists and receiving Pulse alerts.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">2. Location Permissions</h2>
          <p>
            XNEXT uses your location to discover experiences near you (Adventure Radar / Map).
            Precise location is processed only when you explicitly enable it. Your location is never sold.
            We do not build long-term location profiles for advertising. You can disable location access at any time in your device settings or by not using the locate feature.
            Location data used for "near you" queries is transient; persistent home_location (if saved in Preferences) is stored only with your consent and can be removed via Reset Recommendations or Delete Account.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">3. Dream Lists</h2>
          <p>Dream List items (quests you save, plan, or mark completed) are stored tied to your account. They are private by default. You control visibility through status and can export or delete them at any time.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">4. Memories (Quest Completions)</h2>
          <p>When you complete a quest you may add a story and media. These "Memories" belong to you. They are stored with your user id and can be exported or deleted via Privacy Settings. Public sharing is opt-in only.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">5. Quest Completions &amp; Activity</h2>
          <p>We record which quests you complete and basic metadata (completion time, SQ score at time of completion). This powers "Completed" views, Dream List sync, and personal history. Activity is never sold.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">6. Analytics Usage</h2>
          <p>We collect minimal operational analytics (e.g. which features are used, error rates) to improve reliability. We do not use third-party advertising pixels or sell analytics data. No cross-site tracking.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">7. AI Recommendation System (SQ Engine)</h2>
          <p>
            XNEXT uses an on-device + server SQ scoring model and your saved Preferences (preferred experience classes, tags, distance, pulse settings) to surface relevant quests.
            Recommendations are derived from your explicit choices and on-platform behavior within XNEXT only.
            We do not feed personal data to third-party LLMs for profiling. You can reset recommendations at any time.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">8. Data Retention</h2>
          <p>
            Active account data is retained while your account is in good standing.
            When you request deletion we immediately remove Dream Lists, Memories, Pulse alerts, and Preferences.
            Profile PII is cleared and a 30-day recovery window begins. After the window, remaining minimal records may be purged.
            Audit logs are anonymized at deletion time (user id, IP, and user agent removed).
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">9. Your Data Deletion &amp; Access Rights</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Access / Portability:</strong> Use "Download My Data", "Export Memories", and "Export Dream List" in Privacy Settings.</li>
            <li><strong>Deletion:</strong> Use "Delete Account" (30-day recovery). Immediate purge of content + anonymization of logs.</li>
            <li><strong>Correction:</strong> Edit your Profile or Preferences directly.</li>
            <li><strong>Withdraw consent:</strong> Stop using location features or delete your account.</li>
            <li><strong>Object / Restrict:</strong> Contact support or use the reset/clear tools above.</li>
          </ul>
          <p className="mt-2">These rights apply under GDPR (EEA/UK), CCPA (California residents — we do not "sell" personal information), and Washington State privacy laws (My Health My Data and other consumer rights).</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">10. Contact</h2>
          <p>
            For privacy requests, deletion assistance, or questions: <a href="mailto:privacy@xnext.example" className="underline">privacy@xnext.example</a> or use Contact Support in the app footer.
            You may also submit Data Requests via the Trust Center link.
          </p>
        </div>

        <div className="pt-4 text-xs text-muted-foreground border-t">
          XNEXT is committed to the principle: Your memories belong to you. Your adventures belong to you. You can export or delete your data at any time.
        </div>
      </section>
    </div>
  )
}
