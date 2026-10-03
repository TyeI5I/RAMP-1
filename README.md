# RAMP — Recruiter & Applicant Matching Platform

> **Reversing the traditional job board:** Verified candidates remain passive while verified employers discover verified academic credentials and send direct job invites.

---

## ⚡ Overview

RAMP eliminates the resume black hole and keyword-gamed screening. By anchoring candidates to verified academic degrees and enforcing pure mathematical fairness, RAMP enables direct, transparent connections between top talent and hiring teams.

### Key Capabilities

* **Passive Candidate Experience:**
  * Free candidate onboarding with academic credential document upload.
  * OCR Vision Extraction (`/api/ocr-extract`) for degree title, institution, recipient name, and graduation year.
  * Inactivity Engine: 14-day inactivity clock, search pool archiving, and 1-click check-in streak keeper.
  * Gemini Career Studio: AI-powered Authentic "About Me" narratives, formal cover letters, and Google XYZ resume bullets.
  * Direct Job Invite Inbox with contact reveals (email, phone, calendar links) upon acceptance.

* **Verified Employer Portal:**
  * Natural language talent search and categorical/graduation year filtering.
  * Mathematical Fairness Engine: Every candidate search list is randomly shuffled in the backend to ensure unbiased discovery without manual recruiter manipulation.
  * Side-by-side finalist comparison modal (up to 3 candidates).
  * Direct Job Invite dispatch with salary ranges, work arrangement, and reference codes.
  * Tier 1 (25 invites/month) vs. Tier 2 Enterprise (Unlimited invites, 5 team recruiter seats, priority delivery badge, and Stripe billing & PDF invoices).

* **Platform Governance & Admin Console:**
  * Split-screen visual diploma audit with zoom controls.
  * Registrar record approval/rejection and badge issuance.
  * Corporate EIN verification queue.
  * Direct Admin-to-Candidate email composer with pre-built templates and live simulated SMTP outbox inspector.

---

## 🛠️ Tech Stack

* **Frontend:** React 19, TypeScript, Tailwind CSS, Lucide Icons, Motion
* **Backend:** Node.js, Express, tsx
* **AI / Vision:** `@google/genai` (Gemini 2.5 Flash for career studio and document OCR)
* **Build Tool:** Vite

---

## ⚙️ Setup & Environment Variables

Create a `.env` file in the root directory by copying `.env.example`:

```bash
cp .env.example .env
```

| Variable | Required | Description | Default |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | **Yes** (for AI features) | Google Gemini API key used server-side by Express for OCR extraction, Career Studio, and talent search | None |
| `APP_URL` | No | Base application URL used for self-referential links and routing | `http://localhost:3000` |
| `PORT` | No | Local web server listening port | `3000` |

> **Security Note:** `GEMINI_API_KEY` is strictly handled on the backend in `server.ts`. Never prefix with `VITE_` or reference in client-side code.

---

## 🚀 Quick Start (Local Development)

### 1. Clone & Install Dependencies
```bash
git clone <your-github-repo-url>
cd ramp
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Provide your Gemini API key in `.env`:
```env
GEMINI_API_KEY="your_actual_gemini_api_key"
PORT=3000
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📦 Building for Production

### Type Check & Build
```bash
# Run TypeScript type check
npm run lint

# Compile production bundle
npm run build

# Start production server
npm start
```

---

## 🌐 Deploying to Hosting Platforms

* **Cloud Run / Render / Railway / Heroku:** The server runs directly via `node server.ts` or `npm run dev` / `npm start`.
* **Vercel / Netlify:** Use the built `dist/` directory for static client hosting, or host the full-stack server as a Node.js web service.

---

## 📄 License
Private & Proprietary — All rights reserved.
