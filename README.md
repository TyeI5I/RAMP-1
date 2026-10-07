# RAMP — Recruiter & Applicant Matching Platform

> **Reversing the traditional job board:** Verified candidates remain passive while verified employers discover verified academic credentials and send direct job invites.

---

## 🎯 What is RAMP?

RAMP is a full-stack web application that flips the traditional job search model on its head. Instead of candidates frantically applying to jobs, RAMP empowers **verified talent with real academic credentials** to stay passive while **verified employers proactively discover and invite them.**

Think of it as a talent discovery platform where:
- ✅ Candidates upload verified diplomas once and stay searchable
- ✅ Employers search by role, degree level, and skills — then send direct invites
- ✅ A mathematical fairness algorithm ensures unbiased candidate discovery (no recruiter gaming)
- ✅ AI-powered career tools help candidates craft their best "About Me" and cover letters

---

## ⚡ Core Features

### For Candidates
- **Free onboarding** with OCR-powered credential verification (upload your diploma, we verify it)
- **Gemini Career Studio**: AI assistant that helps you write authentic "About Me" sections, personalized cover letters, and resume bullets using the Google XYZ formula
- **Passive discovery model**: Stay in the searchable pool as long as you check in every 14 days (inactivity = automatic archival)
- **Direct job invites** with salary ranges, work arrangements, and company details
- **Contact reveal on acceptance**: Email and phone only show when you accept an invite

### For Employers
- **Natural language talent search** ("Find me TypeScript engineers from Stanford who want remote work")
- **Mathematical fairness engine**: Every search result is randomly shuffled so bias is eliminated
- **Verified credentials at a glance**: Side-by-side candidate comparison with their degree, years of experience, target roles, and personal "About Me"
- **Subscription tiers**:
  - **Tier 1**: 25 invites/month + basic search
  - **Tier 2 Enterprise**: Unlimited invites, team seats, priority delivery badge, Stripe billing & invoices

### For Admins
- **Visual diploma audit** with zoom controls to verify credentials
- **Bulk verification workflow** for candidates and employer EIN verification
- **Email inspector**: View every email the platform sends to candidates (useful for compliance)
- **Direct messaging** to candidates with pre-built templates

---

## 🛠️ Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS (dark mode UI with Lucide icons)
- **Backend**: Node.js + Express + tsx
- **AI/Vision**: Google Gemini 2.5 Flash (OCR extraction, career writing assistant)
- **Build Tool**: Vite (with hot module reload)
- **State Management**: React Context API

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- A free Google Gemini API key (grab one at [aistudio.google.com](https://aistudio.google.com))

### Install & Run

```bash
# Clone the repo
git clone https://github.com/TyeI5I/RAMP-1.git
cd RAMP-1

# Install dependencies
npm install

# Copy .env.example to .env and add your Gemini API key
cp .env.example .env
# Edit .env and set: GEMINI_API_KEY=your_key_here

# Run development server
npm run dev

# Open http://localhost:3000 in your browser
```

### Build for Production

```bash
# Type check & build
npm run lint
npm run build

# Start production server
npm start
```

---

## 🌐 Deploy to the Cloud

RAMP runs on any Node.js host. Recommended platforms:

### Render (Easiest)
1. Push code to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your GitHub repo
4. Set **Build Command**: `npm install && npm run build`
5. Set **Start Command**: `npm start`
6. Add environment variable: `GEMINI_API_KEY=your_key`
7. Click **Deploy** — auto-deploys on every push

### Railway
Similar setup — connect GitHub, set build/start commands, add env vars.

### Vercel (Frontend Only)
Can host the React frontend on Vercel + pair with Render for the Node.js backend API.

---

## 📊 Demo Data

The app comes with **pre-loaded demo candidates and employers** so you can immediately:
- Try the employer search portal
- Send job invites
- See the fairness shuffle in action
- Test the admin verification workflow
- View the email inspector

No database required to explore the features — it's all client-side state with React Context.

---

## 🎓 Key Technical Highlights

### 1. **OCR Credential Verification**
Uses Gemini Vision API to extract degree title, institution, graduation year, and candidate name from diploma images. High confidence score validates authenticity.

### 2. **Fairness Algorithm**
Every candidate search list is **Fisher-Yates shuffled** before display to prevent recruiter bias. Fair discovery is baked into the platform.

### 3. **AI Career Studio**
Gemini powers three document types:
- **"About Me"** (2-3 paragraph personal narrative)
- **Cover Letter** (formal business structure)
- **Resume Bullets** (Google XYZ formula: Accomplished X, measured by Y, by doing Z)

Each has intelligent fallback responses if Gemini API is unavailable.

### 4. **Inactivity Lifecycle Engine**
- Days 0–13: Candidate searchable
- Day 11: Push notification & email warning
- Day 13: Final warning (1 day left)
- Day 14+: Candidate archived (hidden from searches)
- Day 30+: Candidate deleted from platform

Candidates can 1-click "Check In" to reset their clock and stay active.

### 5. **Multi-Role State Management**
Single app, three personas (Candidate / Employer / Admin) with role-specific views and actions. All managed via React Context.

---

## 💡 Why This Project Matters

**For Job Seekers**: Tired of the resume black hole? RAMP gives you a verified degree badge and lets employers come to you.

**For Employers**: Stop keyword-matching resumes. Search for candidates by actual role fit and degree level — no resume tailoring tricks.

**For the Industry**: Credential verification + fair randomization + direct contact = a more transparent, equitable hiring market.

---

## 🗓️ Project Status

**Current**: Full feature-complete MVP with React Context state management, Gemini AI integration, and simulated email system.

**Next Steps**:
- Database integration (PostgreSQL) for persistent data
- Real SMTP email delivery
- Stripe payment processing for employer subscriptions
- Mobile-responsive enhancements
- Analytics dashboards (employer: invite metrics; candidate: profile views)

---

## 📝 License

Private & Proprietary — All rights reserved. Built as a portfolio project for Handshake & professional experience.

---

## 🤝 Questions?

Check out the [CHANGELOG.md](./CHANGELOG.md) for detailed feature list, or explore the code in `/src` to see the React components, state management, and AI integration in action.

**Built with React 19, TypeScript, Tailwind CSS, Node.js, Express, and Google Gemini API.**
