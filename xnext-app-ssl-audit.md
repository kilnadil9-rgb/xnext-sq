# xnext.app — SSL / DNS / Certificate Audit

**Date:** 2026-06-21
**Symptom under investigation:** Safari reports **"Certificate Not Trusted"** on `xnext.app`.
**Host:** Vercel · **Registrar/DNS:** Namecheap BasicDNS

---

## 1. Executive summary

The DNS configuration for `xnext.app` is **correct** for Vercel. The problem is at the **TLS layer**: the Vercel edge is **not presenting a publicly-trusted certificate chain that Safari can validate** for the apex host `xnext.app`. An external TLS scanner (Qualys SSL Labs) could not complete a handshake with the apex endpoint and captured an **empty certificate chain**, which is consistent with a certificate that is unprovisioned, mis-issued, or serving an incomplete/untrusted chain.

Because `.app` is a **Google-operated TLD that is HSTS-preloaded in every major browser**, there is **no HTTP fallback and no "proceed anyway" option** — any certificate fault becomes a hard, un-bypassable error in Safari. This is why the failure is total rather than a click-through warning.

**Most probable root cause:** the Vercel TLS certificate for `xnext.app` is in a failed/pending/stale state (or the domain is not fully verified/assigned to the active project), so the edge serves a certificate Safari will not trust.

---

## 2. What was verified (evidence)

### DNS records

| Record | Host | Value | Assessment |
|---|---|---|---|
| A | `xnext.app` | `76.76.21.21` | ✅ Correct — Vercel's apex anycast IP |
| AAAA | `xnext.app` | *(none)* | ✅ No stray IPv6 (rules out an IPv6-only Safari path failure) |
| CNAME | `www.xnext.app` | `cname.vercel-dns.com` → `76.76.21.98`, `66.33.60.67` | ✅ Correct Vercel target |
| AAAA | `www.xnext.app` | *(none)* | ✅ Clean |
| CAA | `xnext.app` | *(none)* | ✅ No CAA record blocking certificate issuance |
| NS | `xnext.app` | `pdns1.registrar-servers.com`, `pdns2.registrar-servers.com` | ℹ️ DNS hosted at Namecheap (BasicDNS), not Vercel nameservers |

DNS is not the cause. Both apex and `www` point at the right Vercel infrastructure, nothing is blocking certificate issuance (no CAA), and there is no stray AAAA record that could route Safari to a broken endpoint.

### TLS / certificate

- **Qualys SSL Labs** scan of `xnext.app` → endpoint `76.76.21.21`: status **"Failed to communicate with the secure server"**, captured `certChains: []`, `protocols: []`, `certs: []`. Result was **consistent across repeated scans**.
- A lenient server-side HTTP fetch of `https://xnext.app/` *did* return page content (title: "XNEXT | Adventure Radar"). Lenient fetchers often skip strict path-building / use AIA chasing, so this does **not** prove the chain is Safari-trusted — it only shows *some* certificate is presented.
- `https://www.xnext.app/` returned an empty body via the same fetcher (consistent with a redirect to the apex, or a separate cert issue on `www`).

The contrast — a strict validator (SSL Labs) failing with an empty chain while a lenient fetcher succeeds — is the classic signature of a **broken or incomplete certificate chain**: clients that do extra work to build the path succeed; strict clients like Safari fail.

### The `.app` TLD factor (important)

`.app` is on the **HSTS preload list** baked into Chrome, Safari, Firefox and Edge. Consequences:
- The browser **forces HTTPS** before it ever contacts the server.
- On a certificate error there is **no "visit anyway" bypass** — the connection is refused outright.

So a cert issue that would be a dismissible warning on a `.com` is a **complete outage** on a `.app`.

---

## 3. The exact failing certificate

The failing certificate is the **leaf (server/end-entity) certificate served by the Vercel edge for SNI `xnext.app` on `76.76.21.21:443`**. Safari cannot build a trusted path from that leaf to a root in the Apple Trust Store — either because the leaf is a Vercel **self-signed / default fallback** certificate (served while issuance is pending or failed), or because the **intermediate CA certificate is missing** from the chain so the path to the trusted root cannot be completed.

Remote tooling available here could not print the leaf's issuer string directly (the certificate-transparency JSON APIs did not render through the fetcher, and no browser was connected). **The single command below prints the exact failing certificate's Subject, Issuer, validity dates and chain** so the precise issuer is confirmed in seconds — run it from the affected Mac:

```bash
echo | openssl s_client -connect xnext.app:443 -servername xnext.app -showcerts 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

Interpreting the output:
- **Issuer shows `Vercel` / a self-signed value, or the command errors with `self signed certificate` / `unable to get local issuer certificate`** → certificate is unprovisioned or the chain is incomplete (the expected failure here).
- **Issuer is `Let's Encrypt` (R10/R11) or `Google Trust Services` (WE1) and dates are valid** → the leaf is fine; the fault is a missing intermediate or an Apple-root-trust gap on an old OS (see §4, step 5).

To see whether the intermediate is being sent at all:

```bash
echo | openssl s_client -connect xnext.app:443 -servername xnext.app -showcerts 2>/dev/null | grep -c "BEGIN CERTIFICATE"
```
A healthy Vercel chain returns **2** (leaf + intermediate). A result of **1** confirms a missing intermediate.

---

## 4. Step-by-step remediation plan

Work top to bottom; most cases are fixed by steps 1–3.

**Step 1 — Capture the served certificate (confirm the cause).**
Run the two `openssl` commands in §3 from the affected machine. Note the Issuer and whether 1 or 2 certificates are sent. This tells you which branch below applies.

**Step 2 — Re-provision the certificate in Vercel (fixes the common case).**
1. Vercel dashboard → the project that owns `xnext.app` → **Settings → Domains**.
2. Confirm `xnext.app` (and `www.xnext.app`) show **"Valid Configuration"**. If either shows a TLS/certificate error or "pending," that domain's cert never completed.
3. **Remove** `xnext.app` from the project, then **re-add** it. This forces Vercel to re-run domain verification and request a fresh certificate.
4. Wait for the dashboard to report the cert as issued (usually a few minutes). Vercel issues via Let's Encrypt / Google Trust Services, both of which chain to roots in Apple's trust store.

**Step 3 — Verify the domain is assigned to exactly one, correctly-deployed project.**
- A `.app` domain attached to a project with **no successful production deployment**, or **claimed by two projects**, will not get a working cert. Ensure `xnext.app` lives on one project that has a live production deployment.

**Step 4 — Confirm DNS still matches Vercel's expectation (already correct today, re-check after any change).**
- Apex `xnext.app` → A `76.76.21.21`.
- `www.xnext.app` → CNAME `cname.vercel-dns.com`.
- Do **not** add an AAAA record pointing anywhere else, and keep CAA empty (or, if you add CAA, it must permit `letsencrypt.org` **and** `pki.goog`, since Vercel uses both).

**Step 5 — If the leaf is valid but Safari still fails (chain / old-OS branch).**
- **Missing intermediate** (openssl returned 1 certificate): this is on Vercel's edge — re-provisioning in Step 2 normally restores the full chain. Re-test with the `grep -c` command until it returns 2.
- **Old Apple OS:** Let's Encrypt's default chain terminates at **ISRG Root X1**, which is not trusted on macOS < 10.12.1 / iOS < 13.7. If the failing Mac/iPhone is on an old OS, update the OS, or test from a current device to confirm the site is fine for everyone else.
- **Clock skew:** a wrong system date on the Mac makes a valid cert look not-yet-valid/expired. Confirm **System Settings → General → Date & Time** is set automatically.

**Step 6 — Re-validate end-to-end.**
1. Re-run the §3 `openssl` commands — Issuer should be Let's Encrypt or Google Trust Services, dates valid, 2 certs in chain.
2. Hard-refresh in Safari (the HSTS-preload means you must reach a genuinely valid cert; there is no bypass).
3. Optional external confirmation: run a fresh SSL Labs test (`https://www.ssllabs.com/ssltest/analyze.html?d=xnext.app`) and confirm the **Apple/iOS trust path is green** and the grade is A/A+.

---

## 5. Redirects & security headers (note)

The remote tools used here surface page content but not raw HTTP response headers, so HSTS/redirect specifics on the origin could not be fully captured remotely. Once the certificate is valid, verify these locally:

```bash
# Apex and www response headers, redirects, and HSTS
curl -sSI https://xnext.app/        | grep -iE 'HTTP/|location|strict-transport'
curl -sSI https://www.xnext.app/    | grep -iE 'HTTP/|location|strict-transport'
```
Recommended end state: one canonical host (apex **or** `www`) with the other issuing a 308 redirect to it, and a `Strict-Transport-Security` header (Vercel can emit `max-age=63072000; includeSubDomains; preload`). Note that because `.app` is already preloaded, HTTPS is enforced regardless.

---

## 6. One-line takeaway

DNS is correct; the fault is a Vercel-side TLS certificate that Safari won't trust on an HSTS-preloaded `.app` domain. Remove-and-re-add the domain in Vercel to force a fresh, fully-chained certificate, then verify with `openssl s_client` that the Issuer is Let's Encrypt or Google Trust Services and that two certificates are sent.
