import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: '10mb' }));

  // Shared server-side Gemini client utility
  let ai: GoogleGenAI | null = null;
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  // Gemini Career Assistant API Endpoint
  app.post('/api/gemini/chat', async (req, res) => {
    try {
      const {
        messages,
        model = 'gemini-3.8-flash',
        candidateContext,
        taskMode = 'general',
      } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Messages array is required.' });
      }

      const systemInstruction = `You are Gemini Career Studio for RAMP (Recruiter & Applicant Matching Platform).
Your mission is to empower passive talent who hold verified academic credentials.
You MUST recognize which document format the candidate is asking for and strictly enforce these format definitions. Never mix up or blend their formats!

CRITICAL FORMAT SPECIFICATIONS & RULES:

1. AUTHENTIC "ABOUT ME" SECTIONS (Personal Narrative):
   - FORMAT: 2 to 3 fluid, paragraph-based first-person prose blocks (around 150-250 words total). Written from the heart ("I am...", "Beyond technical systems...").
   - CONTENT: Core personal values, collaboration philosophy, curiosity, passions/hobbies outside of work, and ideal team culture.
   - ABSOLUTE PROHIBITIONS:
     * NEVER start with a letter salutation or greeting (e.g., "Dear Hiring Team", "Dear Recruiter", "Dear Hiring Manager").
     * NEVER include a formal letter closing or sign-off (e.g., "Warm regards,", "Sincerely,", "Respectfully,", followed by candidate name).
     * NEVER format as a formal letter structure or an email.
     * NEVER use lists of bulleted job duties or technical achievements (keep those in the Resume).
     * Why: This section is stored directly in the candidate's profile "About Me" box. It is displayed as a public personal story, NOT as a letter to an employer!

2. COVERS LETTERS:
   - FORMAT: A structured, formal business letter.
   - CONTENT: Tailored technical cover letter.
   - MUSTS:
     * MUST start with a formal greeting (e.g., "Dear Engineering Team," or "Dear Hiring Manager,").
     * MUST have 3-4 professional paragraphs highlighting their verified degree and fit for target job categories.
     * MUST end with a formal closing and candidate signature block (e.g., "Sincerely,\n[Name]\n[Email]").

3. RESUME SUMMARY & EXPERIENCE BULLETS:
   - FORMAT: High-impact technical experience bullet points or a single 2-sentence executive summary.
   - MUSTS:
     * MUST use the Google XYZ formula ("Accomplished [X], as measured by [Y], by doing [Z]") to quantify accomplishments with clear metric numbers.
     * MUST be structured, performance-focused, and technically concise.
     * MUST NOT contain conversational stories about hobbies or ideal cultures.

Candidate Context:
- Name: ${candidateContext?.name || 'Candidate'}
- Target Job Categories: ${candidateContext?.targetCategories?.join(', ') || 'Software Engineer'}
- Verified Degree: ${candidateContext?.degreeTitle || 'Bachelor of Science'} from ${candidateContext?.institution || 'University'} (Class of ${candidateContext?.graduationYear || '2024'})
- Years of Experience: ${candidateContext?.yearsOfExperience || 3} years
- Current Resume Summary: ${candidateContext?.resumeSummary || 'Not provided'}
- Current 'About Me' text: ${candidateContext?.aboutMe || 'Not provided yet'}
- Current Cover Letter: ${candidateContext?.coverLetterText || 'Not provided yet'}

Always provide structured, clear, and actionable feedback. When drafting or editing text, provide a clean, ready-to-copy code block or highlighted draft so the candidate can apply it directly to their RAMP profile with 1 click.`;

      // If Gemini API is available on server, call it via official @google/genai SDK
      if (ai) {
        try {
          // Format conversation history for multi-turn chat
          const formattedContents = messages.map((m: { role: string; content: string }) => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }],
          }));

          const response = await ai.models.generateContent({
            model: model || 'gemini-3.8-flash',
            contents: formattedContents,
            config: {
              systemInstruction,
              temperature: 0.7,
            },
          });

          const replyText = response.text || 'I analyzed your request and have recommendations for your profile.';
          return res.json({ text: replyText, modelUsed: model });
        } catch (apiError: any) {
          console.warn('Gemini API call failed, generating intelligent contextual fallback:', apiError?.message);
        }
      }

      // Intelligent Contextual Fallback if GEMINI_API_KEY is not set or network issue
      const lastMessage = messages[messages.length - 1].content.toLowerCase();
      let fallbackText = '';

      if (lastMessage.includes('about me') || taskMode === 'about_me') {
        fallbackText = `Here is a compelling, human-centered **"About Me"** draft tailored to your background as a verified **${candidateContext?.degreeTitle || 'Engineer'}** from **${candidateContext?.institution || 'your university'}**:

### Suggested "About Me" Draft:
> "Beyond engineering systems and technical milestones, I'm someone who thrives at the intersection of curiosity, craft, and collaboration. I believe the best technical work happens when teams foster psychological safety, celebrate intellectual humility, and treat documentation as an act of kindness.
>
> When I step away from the keyboard, you'll usually find me exploring local hiking trails, experimenting with artisanal coffee brewing, and volunteering at community tech workshops.
> 
> What I value most in a team is transparent feedback, blameless problem-solving, and building software that respects both user privacy and accessibility."

💡 *Tip: Click the **"Apply to My Profile"** button below to save this directly to your RAMP "About Me" section!*`;
      } else if (lastMessage.includes('cover letter') || taskMode === 'cover_letter') {
        fallbackText = `Here is a tailored, executive cover letter highlighting your verified academic degree and engineering experience:

### Professional Cover Letter Draft:
**Dear Hiring Team,**

I am writing to express my interest in joining your team as a **${candidateContext?.targetCategories?.[0] || 'Software Engineer'}**. Having recently verified my credentials on RAMP with a **${candidateContext?.degreeTitle || 'Bachelor of Science'}** from **${candidateContext?.institution || 'Stanford University'}**, I am excited by opportunities to work on mission-critical platform architectures.

Over the past **${candidateContext?.yearsOfExperience || 3}+ years**, I have specialized in building reliable, fault-tolerant distributed systems handling heavy throughput. My focus is on writing clean, maintainable code, eliminating architectural bottlenecks, and collaborating with cross-functional partners to ship durable user value.

What attracts me to your engineering organization is your commitment to technical rigor and transparent culture. I welcome the opportunity to discuss how my verified background and hands-on experience can help accelerate your roadmap.

Warm regards,  
**${candidateContext?.name || 'Your Name'}**  
${candidateContext?.email || 'email@example.com'}`;
      } else if (lastMessage.includes('resume') || taskMode === 'resume') {
        fallbackText = `### Resume Bullet Point Optimization (Google XYZ Formula)

Here is how you can level up your resume experience bullet points for maximum recruiter impact:

1. **Before:** "Worked on backend services and database optimizations."  
   **After (XYZ Formula):** *"Architected and deployed 4 distributed microservices handling 45k req/sec, reducing p99 latency by 38% through Redis caching and query indexing."*

2. **Before:** "Helped team improve CI/CD build speeds."  
   **After (XYZ Formula):** *"Redesigned continuous integration pipelines in Docker and GitHub Actions, cutting staging deployment cycle times from 24 mins to 6 mins."*

3. **Suggested Profile Summary:**  
   *"Impact-driven ${candidateContext?.targetCategories?.[0] || 'Software Engineer'} with verified academic credentials from ${candidateContext?.institution || 'University'}. Track record of scaling distributed architectures, optimizing database throughput, and fostering collaborative engineering practices."*

Would you like me to tailor these points further for a specific job title or company?`;
      } else {
        fallbackText = `Hello ${candidateContext?.name || 'there'}! I am **Gemini Career Studio** on RAMP. 

I can assist you with:
- 📝 **Tweaking your resume:** Rewriting bullets to highlight quantified impact and technical depth.
- ✉️ **Crafting personalized cover letters:** Direct, compelling letters tailored to your target job categories.
- 💡 **Writing your 'About Me' section:** Sharing your human values, working style, and passions beyond pure technical credentials.
- 🎯 **Evaluating direct recruiter invites:** Analyzing compensation ranges and formulating replies.

What would you like to work on first?`;
      }

      return res.json({
        text: fallbackText,
        modelUsed: model,
        fallbackMode: true,
      });
    } catch (err: any) {
      console.error('Gemini chat route error:', err);
      res.status(500).json({ error: err?.message || 'Internal server error' });
    }
  });

  // Dedicated Gemini 'About Me' Personal Narrative Assistant Endpoint
  app.post('/api/gemini/about-me-helper', async (req, res) => {
    try {
      const {
        action = 'draft', // 'draft' | 'polish' | 'evaluate'
        tone = 'grounded', // 'grounded' | 'collaborative' | 'curious' | 'passionate'
        currentText = '',
        candidateContext = {},
        customInstruction = '',
        model = 'gemini-3.8-flash',
      } = req.body;

      const candName = candidateContext.name || 'Candidate';
      const candMajor = candidateContext.degreeTitle || 'Computer Science';
      const candSchool = candidateContext.institution || 'University';
      const candCategories = candidateContext.targetCategories || ['Full-Stack Software Engineer'];
      const primaryCategory = candCategories[0] || 'Software Engineer';

      const checklistCriteria = [
        {
          id: 'values',
          title: 'Core Values & Work Philosophy',
          desc: 'Principles guiding decisions, ethics, intellectual humility, and craft integrity',
        },
        {
          id: 'collaboration',
          title: 'Collaboration & Communication Style',
          desc: 'How you collaborate, give/receive feedback, and cultivate psychological safety',
        },
        {
          id: 'curiosity',
          title: 'Curiosity & Problem-Solving Mindset',
          desc: 'What puzzles or technical domains excite you and how you explore unfamiliar problems',
        },
        {
          id: 'passions',
          title: 'Life Beyond Work (Passions & Hobbies)',
          desc: 'Human pursuits, creative arts, outdoor sports, maker hobbies that recharge you',
        },
        {
          id: 'culture_fit',
          title: 'Ideal Team Culture & Environment',
          desc: 'The environment where you do your best work (blameless culture, high agency, thoughtful documentation)',
        },
      ];

      // If Gemini API is available, invoke Gemini 3.8 Flash
      if (ai) {
        try {
          if (action === 'draft') {
            const systemPrompt = `You are the Gemini Personal Narrative Writer on RAMP (Recruiter & Applicant Matching Platform).
Your goal is to write a warm, genuine, human 'About Me' narrative for a candidate that showcases who they are beyond their resume trophies.
The narrative must naturally touch upon the 5 essential checklist pillars:
1. Core values and work philosophy (e.g. intellectual humility, craft integrity).
2. Collaboration and communication style (e.g. team feedback, psychological safety).
3. Curiosity and problem-solving mindset (what kinds of challenges ignite them).
4. Life beyond work: authentic hobbies, passions, or creative outlets.
5. Ideal team culture where they thrive.

Guidelines:
- Tone: ${tone} (Warm, confident, authentic, zero corporate robotic cliches like 'synergy' or 'rockstar').
- Length: 2 to 3 engaging paragraphs (around 150-250 words).
- Return ONLY the clean narrative text without markdown headers, titles, or quotes.`;

            const userPrompt = `Candidate profile context:
- Name: ${candName}
- Primary Field: ${primaryCategory}
- Verified Academic Background: ${candMajor} from ${candSchool}
- Additional Guidance / Notes: ${customInstruction || 'Write an authentic, human story that balances technical curiosity with warm team collaboration and personal hobbies.'}`;

            const response = await ai.models.generateContent({
              model,
              contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
              config: {
                systemInstruction: systemPrompt,
                temperature: 0.75,
              },
            });

            const narrative = response.text?.trim() || '';
            return res.json({ narrative, action, modelUsed: model });
          } else if (action === 'polish') {
            const systemPrompt = `You are the Gemini Personal Narrative Editor on RAMP.
Take the candidate's existing 'About Me' draft and polish it:
- Elevate flow, rhythm, and storytelling.
- Retain their authentic human voice and personal details (do not erase their specific hobbies or personality).
- Remove hollow corporate buzzwords and robotic phrasing.
- Ensure it touches upon core values, collaboration style, and passions outside work.
- Return ONLY the polished narrative text without surrounding quotes or conversational remarks.`;

            const response = await ai.models.generateContent({
              model,
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: `Candidate: ${candName} (${primaryCategory})\nTone: ${tone}\nCurrent Draft:\n"${currentText}"\nOptional Request: ${customInstruction}`,
                    },
                  ],
                },
              ],
              config: {
                systemInstruction: systemPrompt,
                temperature: 0.6,
              },
            });

            const polished = response.text?.trim() || currentText;
            return res.json({ narrative: polished, action, modelUsed: model });
          } else if (action === 'evaluate') {
            const systemPrompt = `You are the Gemini Career Evaluation Engine on RAMP.
Analyze the provided 'About Me' personal narrative against these 5 checklist pillars:
1. values: Core Values & Work Philosophy
2. collaboration: Collaboration & Communication Style
3. curiosity: Curiosity & Problem-Solving Mindset
4. passions: Life Beyond Work (Passions & Hobbies)
5. culture_fit: Ideal Team Culture & Environment

Output strictly valid JSON with this format:
{
  "checklist": [
    { "id": "values", "covered": true|false, "feedback": "Short 1-sentence observation or suggestion" },
    { "id": "collaboration", "covered": true|false, "feedback": "..." },
    { "id": "curiosity", "covered": true|false, "feedback": "..." },
    { "id": "passions", "covered": true|false, "feedback": "..." },
    { "id": "culture_fit", "covered": true|false, "feedback": "..." }
  ],
  "overallScore": 85,
  "summaryTip": "One concise tip to make the narrative even stronger."
}`;

            const response = await ai.models.generateContent({
              model,
              contents: [{ role: 'user', parts: [{ text: `Narrative to evaluate:\n"${currentText}"` }] }],
              config: {
                systemInstruction: systemPrompt,
                responseMimeType: 'application/json',
                temperature: 0.3,
              },
            });

            const parsed = JSON.parse(response.text || '{}');
            return res.json({
              checklist: parsed.checklist || [],
              overallScore: parsed.overallScore || 75,
              summaryTip: parsed.summaryTip || 'Strong start! Consider adding an outdoor hobby or creative outlet to round out the personal side.',
              modelUsed: model,
            });
          }
        } catch (apiErr: any) {
          console.warn('Gemini About-Me helper call failed, using intelligent fallback:', apiErr?.message);
        }
      }

      // Contextual High-Fidelity Fallback Logic
      if (action === 'draft') {
        let draftText = '';
        if (tone === 'collaborative') {
          draftText = `Beyond engineering architecture and code commits, I believe great software is fundamentally a team sport. Having studied ${candMajor} at ${candSchool}, I learned early on that the best technical breakthroughs emerge when teams foster psychological safety, active listening, and open intellectual debate.

In my day-to-day work, I prioritize blameless incident retrospectives, clear asynchronous documentation, and mentorship. I love partnering closely with product managers and designers to understand the "why" behind every feature before writing a single line of implementation.

When I step away from the keyboard, you'll usually find me experimenting with pour-over coffee recipes, playing board games with friends, and hiking local state trails. I do my best work with teams that value high empathy, continuous learning, and building software that genuinely respects user privacy.`;
        } else if (tone === 'curious') {
          draftText = `I'm an engineer driven by relentless curiosity and a passion for deep systems craft. Whether scaling high-throughput pipelines or optimizing distributed query performance, what excites me most is dissecting complex, ambiguous technical puzzles down to first principles.

My academic grounding in ${candMajor} from ${candSchool} instilled a lifelong habit of continuous learning. When faced with an unfamiliar toolchain or architectural paradigm, I dive in hands-on by building experimental prototypes and stress-testing edge cases.

Outside of technical work, I recharge by restoring analog synthesizers, exploring astronomy, and trail running. I thrive in engineering cultures that celebrate intellectual humility, autonomous ownership, and thoughtful code craft without unnecessary bureaucracy.`;
        } else {
          draftText = `Beyond my technical experience and verified credentials in ${candMajor} from ${candSchool}, I am someone who values craft integrity, empathy, and sustainable engineering velocity. I believe durable software is built when teams take pride in maintainability and treat thorough documentation as an act of kindness to future teammates.

I approach collaboration with an open mind, welcoming constructive critique and cross-functional debate. To me, being a great teammate means celebrating mutual wins, jumping in to debug outages without pointing fingers, and staying humble in the face of complex problems.

When offline, I enjoy trail running, exploring indie bookstores, and volunteering at community STEM hackathons. I am looking for a team culture grounded in transparent communication, high trust, and building products with lasting social utility.`;
        }

        return res.json({
          narrative: draftText,
          action,
          modelUsed: model,
          fallbackMode: true,
        });
      } else if (action === 'polish') {
        const text = currentText.trim();
        const polished = text.length > 20
          ? `${text}\n\nWhat matters most to me is being part of a team with high psychological safety, intellectual humility, and a shared pride in craft.`
          : `Beyond my technical degree in ${candMajor} from ${candSchool}, I am dedicated to building sustainable, user-respecting software with teams that champion empathy, open communication, and blameless retrospectives. When offline, I enjoy hiking, reading, and exploring local coffee shops.`;

        return res.json({
          narrative: polished,
          action,
          modelUsed: model,
          fallbackMode: true,
        });
      } else {
        // Heuristic evaluate checklist
        const lower = currentText.toLowerCase();
        const evalList = checklistCriteria.map((item) => {
          let covered = false;
          if (item.id === 'values' && (lower.includes('value') || lower.includes('principle') || lower.includes('humil') || lower.includes('craft') || lower.includes('integri') || lower.includes('belie'))) {
            covered = true;
          } else if (item.id === 'collaboration' && (lower.includes('team') || lower.includes('collaborat') || lower.includes('feedback') || lower.includes('listen') || lower.includes('safet'))) {
            covered = true;
          } else if (item.id === 'curiosity' && (lower.includes('curio') || lower.includes('learn') || lower.includes('puzzle') || lower.includes('problem') || lower.includes('solv') || lower.includes('explor'))) {
            covered = true;
          } else if (item.id === 'passions' && (lower.includes('outside') || lower.includes('hike') || lower.includes('run') || lower.includes('music') || lower.includes('coffee') || lower.includes('book') || lower.includes('offline') || lower.includes('keyboard') || lower.includes('recharg'))) {
            covered = true;
          } else if (item.id === 'culture_fit' && (lower.includes('cultur') || lower.includes('environ') || lower.includes('thrive') || lower.includes('blameless') || lower.includes('autonom') || lower.includes('trust'))) {
            covered = true;
          }
          return {
            id: item.id,
            covered,
            feedback: covered
              ? `Great coverage! Addresses ${item.title.toLowerCase()} authentically.`
              : `Consider expanding on your ${item.title.toLowerCase()} to give recruiters a complete picture.`,
          };
        });

        const coveredCount = evalList.filter((x) => x.covered).length;
        return res.json({
          checklist: evalList,
          overallScore: Math.round((coveredCount / evalList.length) * 100),
          summaryTip: coveredCount === 5
            ? 'Outstanding narrative! All 5 personal pillars are covered with warmth and balance.'
            : 'Looking good! Add a sentence covering the remaining checklist items for maximum recruiter resonance.',
          modelUsed: model,
          fallbackMode: true,
        });
      }
    } catch (err: any) {
      console.error('About Me helper route error:', err);
      res.status(500).json({ error: err?.message || 'Internal server error' });
    }
  });

  // Fisher-Yates shuffle helper for server
  function shuffleArray<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Gemini Employer Natural Language Search API Endpoint
  app.post('/api/gemini/employer-search', async (req, res) => {
    try {
      const { prompt, candidates = [], model = 'gemini-3.8-flash' } = req.body;

      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt string is required.' });
      }

      // Filter only active, verified candidates (RAMP 14/30 rule)
      const eligiblePool = candidates.filter(
        (c: any) =>
          c.verificationStatus === 'verified' &&
          (c.simulatedDaysInactive === undefined || c.simulatedDaysInactive < 14) &&
          c.lifecycleStatus !== 'archived' &&
          c.lifecycleStatus !== 'deleted'
      );

      const promptLower = prompt.toLowerCase();

      // If Gemini API is available, ask Gemini to parse and evaluate
      if (ai) {
        try {
          const candidateBriefs = eligiblePool.map((c: any) => ({
            id: c.id,
            name: c.name,
            categories: c.targetCategories,
            degree: `${c.degreeTitle} from ${c.institution}`,
            degreeType: c.degreeType,
            remote: c.remotePreference,
            location: c.location,
            skills: c.skills,
            aboutMe: c.aboutMe,
            bio: c.bio,
          }));

          const systemPrompt = `You are the Talent Matchmaker on RAMP.
An employer is searching for candidates in plain natural language.
Your job:
1. Understand the employer's request: roles, degree levels, skills, remote preference, and personality/values reflected in their 'About Me'.
2. Select candidate IDs matching their criteria.
3. Bring up a list of ten candidates if there are ten available in the pool (select the closest matching candidates first, filling up to 10 with relevant active candidates from the pool).
4. Output strictly valid JSON with this schema:
{
  "matchedIds": ["cand-001", "cand-002", ...],
  "extractedCriteria": {
    "role": "e.g. Distributed Systems Engineer",
    "degree": "e.g. Bachelor's or Master's",
    "remote": "e.g. Remote Only",
    "skills": ["Rust", "TypeScript"]
  }
}`;

          // Try gemini-3.8-flash or fallback model
          let responseText = '';
          const candidateModels = [model, 'gemini-3.1-flash-lite', 'gemini-flash-latest'].filter(Boolean);
          for (const m of candidateModels) {
            try {
              const response = await ai.models.generateContent({
                model: m,
                contents: `Employer Search Prompt: "${prompt}"\n\nCandidate Pool:\n${JSON.stringify(
                  candidateBriefs
                )}`,
                config: {
                  systemInstruction: systemPrompt,
                  responseMimeType: 'application/json',
                  temperature: 0.3,
                },
              });
              responseText = response.text || '';
              if (responseText) break;
            } catch (err: any) {
              console.warn(`Model ${m} failed, trying next:`, err?.message);
            }
          }

          if (responseText) {
            const parsed = JSON.parse(responseText);
            let matchedIds = parsed.matchedIds || [];

            // Ensure only existing IDs
            const validMatchedIds = matchedIds.filter((id: string) =>
              eligiblePool.some((c: any) => c.id === id)
            );

            // If fewer than 10 matched but pool has more, fill with remaining pool candidates
            const remainingPool = eligiblePool
              .filter((c: any) => !validMatchedIds.includes(c.id))
              .map((c: any) => c.id);

            let finalIds = [...validMatchedIds];
            if (finalIds.length < 10 && remainingPool.length > 0) {
              const needed = Math.min(10 - finalIds.length, remainingPool.length);
              finalIds.push(...shuffleArray(remainingPool).slice(0, needed));
            }

            // RAMP MANDATE: Randomize the matched list using Fisher-Yates pure shuffle for fairness
            const randomizedIds = shuffleArray(finalIds);

            return res.json({
              matchedCandidateIds: randomizedIds,
              extractedCriteria: parsed.extractedCriteria || {},
              modelUsed: model,
            });
          }
        } catch (apiErr: any) {
          console.warn('Gemini employer search API failed, falling back to heuristic matcher:', apiErr?.message);
        }
      }

      // Contextual Heuristic Matcher Fallback: Bring up a list of ten if there is ten
      const scoredCandidates = eligiblePool.map((c: any) => {
        const fullText = `${c.name} ${c.targetCategories?.join(' ')} ${c.degreeTitle} ${
          c.institution
        } ${c.skills?.join(' ')} ${c.aboutMe || ''} ${c.bio || ''} ${c.location} ${c.remotePreference}`.toLowerCase();

        const keywords = promptLower.split(/\s+/).filter((w) => w.length > 2);
        let score = 0;
        for (const kw of keywords) {
          if (fullText.includes(kw)) score += 1;
        }
        return { id: c.id, score };
      });

      scoredCandidates.sort((a: { score: number }, b: { score: number }) => b.score - a.score);
      const topMatches = scoredCandidates.filter((item: { score: number }) => item.score > 0).map((item: { id: string }) => item.id);

      // Target list of ten: if there are ten or more in the pool, make sure we return 10
      let poolOfTen = [...topMatches];
      if (poolOfTen.length < 10) {
        const remaining = eligiblePool
          .filter((c: any) => !poolOfTen.includes(c.id))
          .map((c: any) => c.id);
        const needed = Math.min(10 - poolOfTen.length, remaining.length);
        poolOfTen.push(...shuffleArray(remaining).slice(0, needed));
      }

      const randomizedIds = shuffleArray(poolOfTen.slice(0, 10));

      return res.json({
        matchedCandidateIds: randomizedIds,
        extractedCriteria: {
          query: prompt,
        },
        modelUsed: model,
        fallbackMode: true,
      });
    } catch (err: any) {
      console.error('Employer search route error:', err);
      res.status(500).json({ error: err?.message || 'Internal server error' });
    }
  });

  // Setup Vite in development or serve static assets in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`RAMP Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
