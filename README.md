# RAMPED — Recruiter & Applicant Matching Platform for Employment and Discovery

> **Reversing the traditional job board:** Verified candidates remain passive while verified employers discover verified academic credentials and send direct job invites.

---

## 🎯 What is RAMPED?

RAMPED is a full-stack web application that flips the traditional job search model on its head. Instead of candidates frantically applying to jobs, RAMPED empowers **verified talent with real academic credentials** to stay passive while **verified employers proactively discover and invite them.**

Think of it as a talent discovery platform where:
- ✅ Candidates submit credential documents for private, manual review
- ✅ Employers search by role, degree level, and skills — then send direct invites
- ✅ A mathematical fairness algorithm ensures unbiased candidate discovery (no recruiter gaming)
- ✅ AI-powered career tools help candidates craft their best "About Me" and cover letters

---

## ⚡ Core Features

### For Candidates
- **Free onboarding** with private academic-credential submission for manual review and separate Persona government-ID verification
- **Gemini Career Studio**: AI assistant that helps you write authentic "About Me" sections, personalized cover letters, and resume bullets using the Google XYZ formula
- **Passive discovery model**: Stay in the searchable pool as long as you check in every 14 days (inactivity = automatic archival)
- **Direct job invites** with salary ranges, work arrangements, and company details
- **Candidate privacy controls**: Employer search omits email, credential files, and phone unless candidates choose to show it

### For Employers
- **Tier 2 natural-language talent search** ("Find me TypeScript engineers who want remote work")
- **Mathematical fairness engine**: Every search result is randomly shuffled so bias is eliminated
- **Verified credentials at a glance**: Side-by-side candidate comparison with their degree, years of experience, target roles, and personal "About Me"
- **Subscription tiers**:
  - **Tier 1**: 25 invites/month + basic search
  - **Tier 2 Enterprise**: Unlimited invites, team seats, priority delivery badge, Stripe-hosted recurring billing
- **Authenticated billing**: Supabase employer sign-in, persistent billing records, Stripe webhook updates, and customer portal access
- **Persona business verification**: Employer business and representative checks through a secure hosted inquiry flow

### For Admins
- **Visual diploma audit** with zoom controls to verify credentials
- **Academic credential review** and manual escalation for inconclusive Persona decisions
- **Persistent verification queues** for candidate credentials and employer business profiles

---

## 🛠️ Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS (dark mode UI with Lucide icons)
- **Backend**: Node.js + Express + tsx
- **AI**: Google Gemini career-writing and Tier 2 search assistance
- **Build Tool**: Vite (with hot module reload)
- **State Management**: React Context API

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20.19+ or 22.12+
- npm or yarn
- A free Google Gemini API key (grab one at [aistudio.google.com](https://aistudio.google.com))

### Install & Run

```bash
# Clone the repo
git clone https://github.com/TyeI5I/RAMP-1.git
cd RAMP-1

# Install dependencies
npm install

# Copy .env.example to .env and configure the required services
cp .env.example .env
# Never commit .env or expose server-only keys as VITE_ variables

# Run development server
npm run dev

# Open http://localhost:3000 in your browser
```

### Build for Production

```bash
# Type check & build
npm run lint
npm run build
npm test

# Start production server
npm start
```

---

## 🌐 Deploy to the Cloud

RAMPED runs as a standard Node.js web service on Render, Railway, or another Node host. Use Node 20.19+ or 22.12+:

```text
Build command: npm ci && npm run build
Start command: npm start
Health check: /api/health/ready
```

### Private Beta Setup

Production builds disable demo personas and require signed-in, email-confirmed Supabase accounts. Signup is restricted to server-side `BETA_ALLOWED_EMAILS`. Set `ADMIN_EMAILS` to one or more beta emails to grant administrator access; administrator roles cannot be assigned from the browser.

1. Create a Supabase project, enable email/password auth, and require email confirmation.
2. Apply all migrations in order: [`20261113110000_create_billing_tables.sql`](./supabase/migrations/20261113110000_create_billing_tables.sql), [`20261113120000_create_marketplace_tables.sql`](./supabase/migrations/20261113120000_create_marketplace_tables.sql), [`20261115130000_add_lifecycle_and_email_services.sql`](./supabase/migrations/20261115130000_add_lifecycle_and_email_services.sql), then [`20261116090000_add_persona_verification.sql`](./supabase/migrations/20261116090000_add_persona_verification.sql).
3. Configure browser keys (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) and server keys (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Never expose the service-role key to the browser.
4. Set `BETA_ALLOWED_EMAILS` and `ADMIN_EMAILS` to comma-separated addresses. Every admin address must also appear in the beta allowlist.
5. In Stripe test mode, create USD recurring prices for Tier 1 ($299 monthly / $2,990 annually) and Tier 2 ($599 monthly / $5,990 annually). Set `STRIPE_SECRET_KEY` and all four matching `STRIPE_PRICE_*` IDs.
6. Enable the Stripe customer portal. Configure a webhook at `https://<your-app>/api/stripe/webhook` for `checkout.session.completed` and `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`; set `STRIPE_WEBHOOK_SECRET`.
7. In Persona, create and publish two separate inquiry templates: one for candidate government-ID checks (including any liveness checks you require) and one for employer/business and representative checks. Configure the business workflow to collect the business details/EIN within Persona. Set the server-only `PERSONA_API_KEY`, `PERSONA_CANDIDATE_IDENTITY_TEMPLATE_ID`, and `PERSONA_EMPLOYER_BUSINESS_TEMPLATE_ID`.
8. Configure a Persona webhook at `https://<your-app>/api/persona/webhook` for `inquiry.approved`, `inquiry.declined`, `inquiry.marked-for-review`, `inquiry.failed`, and `inquiry.expired`; set its signing secret as `PERSONA_WEBHOOK_SECRET`. Use the same Persona environment as the API key and templates, and allow your app's HTTPS origin as a Hosted Flow redirect destination.
9. Set `APP_URL` to the public HTTPS origin and `GEMINI_API_KEY` on the server. Configure Supabase Auth's site URL and redirect URLs for that origin.
10. Configure Resend: verify your sending domain, set `RESEND_API_KEY`, and set `EMAIL_FROM` to a sender on that verified domain. Configure Supabase Auth's SMTP settings separately (using Resend SMTP credentials) for signup confirmation and password-reset emails.
11. Create a Render Cron Job for this repository and branch with build command `npm ci`, command `npm run job:lifecycle`, and schedule `*/15 * * * *` (every 15 minutes). Set `APP_URL` and the same server-only `CRON_SECRET` on the cron service; use a random secret of at least 32 characters. The job calls the web service's protected `/api/jobs/lifecycle` endpoint.

`/api/health/ready` checks production configuration and required Supabase tables. It returns 503 until all setup is complete. Billing uses Stripe-hosted Checkout; RAMPED does not collect card details.

Candidate and employer profiles, invites, verification decisions, and notifications are stored in Supabase. Server routes enforce account roles, employer verification, active subscription status, Tier 2 search, invite quotas, and candidate visibility. Government-ID and employer/business inquiries are completed in Persona after explicit user consent; consent timestamps, inquiry references, and status are stored, not ID images or employer EINs. Signed, idempotent Persona webhooks update verification status. Employer checks requiring review remain unavailable until an administrator decides them. Candidate academic documents are a separate process: they are limited to 5 MB and visible only to the candidate and administrators, and credential decisions remain manual because RAMPED does not independently verify university records.

The app sends job-invite, verification, administrator, and inactivity emails through a retryable transactional outbox. The lifecycle job checks every 15 minutes, sends candidate warnings at days 11, 13, 14, and 27, then permanently deletes candidate accounts at day 30 unless they check in. Users can download a JSON export and permanently delete their own account from **Account data**; active Stripe subscriptions are canceled before RAMPED data is removed. Stripe may retain its own financial records. The scheduled job and email delivery are not active until the provider credentials, database migration, and Render Cron Job are configured.

Before public launch, publish legally reviewed Terms of Service and Privacy Policy and complete privacy/compliance review. Test Supabase Auth, migrations/RLS, Resend delivery, export/deletion, the scheduled lifecycle job, Stripe test checkout, webhook delivery, and cancellation end-to-end before accepting live payments.

---

## 📊 Demo Data

Local development includes pre-loaded demo candidates and employers so you can immediately:
- Try the employer search portal
- Send job invites
- See the fairness shuffle in action
- Test the admin verification workflow
- Explore the simulated notification and email inspector

Demo data is available only with `npm run dev`. Production starts with no seed accounts; real accounts require the beta allowlist and Supabase. Local demo changes use browser storage and do not represent persistent or secure production behavior.

---

## 🎓 Key Technical Highlights

### 1. **Separate Identity, Business, and Academic Verification**
Persona verifies candidate identity and employer/business submissions through hosted inquiry flows. RAMPED grants employer access only after a signed Persona approval event; inconclusive and review-needed results remain pending for an administrator. Candidate identity status does not approve an academic credential. Candidates submit academic documents for separate manual review, and uploading a document does not verify a degree.

### 2. **Fairness Algorithm**
Every candidate search list is **Fisher-Yates shuffled** before display to prevent recruiter bias. Fair discovery is baked into the platform.

### 3. **AI Career Studio**
Gemini powers three document types:
- **"About Me"** (2-3 paragraph personal narrative)
- **Cover Letter** (formal business structure)
- **Resume Bullets** (Google XYZ formula: Accomplished X, measured by Y, by doing Z)

Each has intelligent fallback responses if Gemini API is unavailable.

### 4. **Candidate Activity**
Candidates can check in to remain searchable. The server excludes profiles that have not checked in within 14 days. The scheduled lifecycle job checks every 15 minutes, sends warning emails, and permanently removes inactive candidate accounts on Day 30.

### 5. **Multi-Role State Management**
Single app, three personas (Candidate / Employer / Admin) with role-specific views and actions. All managed via React Context.

---

## 💡 Why This Project Matters

**For Job Seekers**: Tired of the resume black hole? RAMPED gives you a verified degree badge and lets employers come to you.

**For Employers**: Stop keyword-matching resumes. Search for candidates by actual role fit and degree level — no resume tailoring tricks.

**For the Industry**: Credential verification + fair randomization + direct contact = a more transparent, equitable hiring market.

---

## 🗓️ Project Status

**Current**: Invite-only private-beta foundation with Supabase authentication and persistence, manually administered verification, subscription-gated employer discovery, and Stripe billing.

**Next Steps**:
- Configure external Supabase, Stripe, and Gemini projects and the host environment
- Publish legally reviewed Terms of Service and Privacy Policy and complete privacy/compliance review
- Run full test-mode signup, verification, search, invite, checkout, webhook, and cancellation flows

---

## 📝 License

Private & Proprietary — All rights reserved. Built as a portfolio project for Handshake & professional experience.

---

## 🤝 Questions?

Check out the [CHANGELOG.md](./CHANGELOG.md) for detailed feature list, or explore the code in `/src` to see the React components, state management, and AI integration in action.

**Built with React 19, TypeScript, Tailwind CSS, Node.js, Express, and Google Gemini API.**
