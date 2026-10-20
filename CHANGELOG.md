# RAMP Changelog

All notable changes to the RAMP project (Recruiter & Applicant Matching Platform) are documented here.

## [v0.1.0] - 2026-10-07

### Features
- **Candidate Onboarding Portal**
  - Free account registration with verified academic credential uploads
  - OCR credential extraction using Gemini Vision (degree title, institution, graduation year, candidate name)
  - Multi-role support (Candidate, Employer, Admin personas)

- **Gemini Career Studio**
  - AI-powered "About Me" narrative generation (draft, polish, evaluate)
  - Personalized cover letter drafting with formal structure
  - Resume bullet optimization using Google XYZ formula (X = accomplished, Y = measured by, Z = by doing)
  - Multi-turn conversation history with context-aware fallback mode

- **Employer Search Portal**
  - Natural language candidate search with Gemini NLP parsing
  - Categorical job filtering (10 role categories: Full-Stack, DevOps, Product Manager, ML Engineer, etc.)
  - Mathematical fairness engine: Fisher-Yates shuffle of matched candidate lists to prevent recruiter bias
  - Side-by-side finalist comparison modal (up to 3 candidates at once)
  - Direct job invite dispatch with salary range, work arrangement, and reference codes
  - Subscription tiers:
    - **Tier 1**: 25 invites/month, basic candidate search
    - **Tier 2 Enterprise**: Unlimited invites, 5 team recruiter seats, priority delivery badge, Stripe billing & PDF invoices

- **Candidate Experience**
  - Direct Job Invite inbox with contact reveals (email, phone, calendar) upon acceptance
  - Inactivity engine: 14-day inactivity clock, automatic archival, 1-click check-in streak keeper
  - Passive candidate discovery: candidates remain hidden unless they check in
  - Lifecycle status tracking (active, warning_1day, warning_3day, archived, deletion_warning, deleted)
  - Email notifications at key lifecycle milestones (11-day and 13-day inactivity)

- **Admin Portal**
  - Split-screen visual diploma audit with zoom and pan controls
  - Registrar record approval/rejection workflow
  - Corporate EIN verification queue (with fallback heuristic verification)
  - Direct admin-to-candidate email composer with pre-built templates
  - Live simulated SMTP outbox inspector (view all platform-dispatched emails)
  - Candidate verification badge management

- **Platform Infrastructure**
  - Full-stack TypeScript (React 19 frontend, Node.js/Express backend)
  - Tailwind CSS + Lucide Icons for consistent dark-mode UI
  - Vite build tooling with hot module reload (development)
  - State management via React Context API
  - Production-ready error handling with fallback logic
  - Health check endpoint (`/health`) for deployment monitoring
  - Environment variable configuration (GEMINI_API_KEY, PORT, APP_URL)

### Technical Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS 4, Lucide React Icons, Motion.js animations
- **Backend**: Node.js, Express 4, tsx (TypeScript executor)
- **AI/Vision**: @google/genai (Gemini 2.5 Flash)
- **Build**: Vite 8 with @tailwindcss/vite plugin
- **Type Checking**: TypeScript 7

### Known Limitations
- Gemini API calls fall back to heuristic/template-based responses if API is unavailable
- Demo mode uses simulated candidate pool; production requires database integration
- Email dispatch is simulated (no actual SMTP sending in current build)

### Roadmap
- [ ] Database integration (PostgreSQL) for persistent candidate/employer profiles
- [ ] Real SMTP email delivery integration
- [ ] Stripe payment processing for employer subscription tiers
- [ ] Mobile-optimized responsive design enhancements
- [ ] Multi-language support
- [ ] Analytics dashboard for employers (invite sent, response rates, conversion)
- [ ] Candidate analytics (profile views, invite frequency, acceptance rates)
