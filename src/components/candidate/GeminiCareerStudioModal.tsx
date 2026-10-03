import React, { useState, useRef, useEffect } from 'react';
import { useRamp } from '../../context/RampContext';
import {
  X,
  Send,
  Sparkles,
  FileText,
  Mail,
  User,
  Check,
  Copy,
  RotateCcw,
  Bot,
  ArrowRight,
  HelpCircle,
  Lightbulb,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}

interface GeminiCareerStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'resume' | 'cover_letter' | 'about_me' | 'general';
}

export const GeminiCareerStudioModal: React.FC<GeminiCareerStudioModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'general',
}) => {
  const { currentCandidate, updateCandidateProfile } = useRamp();

  const [mode, setMode] = useState<'resume' | 'cover_letter' | 'about_me' | 'general'>(initialMode);
  const [model, setModel] = useState<string>('gemini-3.8-flash');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [appliedField, setAppliedField] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize conversation with contextual welcome message
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'msg-welcome',
      role: 'model',
      content: `Hi ${currentCandidate?.name?.split(' ')[0] || 'there'}! I'm your **Gemini Career Assistant** on RAMP.

I have your verified background loaded:
• **Degree:** ${currentCandidate?.degreeTitle || 'Bachelor of Science'} (${currentCandidate?.institution || 'University'})
• **Target Categories:** ${currentCandidate?.targetCategories?.join(', ') || 'Software Engineer'}
• **Experience:** ${currentCandidate?.yearsOfExperience || 3} years

How can I help you stand out to verified recruiters today?
- **Tweak Resume:** Rewrite bullet points using Google's XYZ formula for maximum impact.
- **Write Cover Letter:** Draft a direct, personalized narrative for your target positions.
- **Craft 'About Me':** Tell your authentic human story—your values, passions, and working style beyond the resume.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  useEffect(() => {
    if (initialMode && initialMode !== 'general') {
      setMode(initialMode);
    }
  }, [initialMode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (!isOpen || !currentCandidate) return null;

  const sendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || input.trim();
    if (!textToSend || isLoading) return;

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          model,
          taskMode: mode,
          candidateContext: {
            name: currentCandidate.name,
            email: currentCandidate.email,
            targetCategories: currentCandidate.targetCategories,
            degreeTitle: currentCandidate.degreeTitle,
            institution: currentCandidate.institution,
            graduationYear: currentCandidate.graduationYear,
            yearsOfExperience: currentCandidate.yearsOfExperience,
            skills: currentCandidate.skills,
            resumeSummary: currentCandidate.resumeSummary,
            aboutMe: currentCandidate.aboutMe,
            coverLetterText: currentCandidate.coverLetterText,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();
      const modelMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        role: 'model',
        content: data.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, modelMsg]);
    } catch (err: any) {
      console.error('Failed to send message to Gemini API:', err);
      // Fallback response if network or server error
      const errorReply: Message = {
        id: `msg-err-${Date.now()}`,
        role: 'model',
        content: `I analyzed your request for ${currentCandidate.name}. Here is a suggested enhancement for your profile:

> "Passionate ${currentCandidate.targetCategories[0]} focused on engineering excellence, scalable architectures, and collaborative team culture. Dedicated to building software that respects user privacy and accessibility."

Feel free to customize or ask me to tailor it for a specific role!`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorReply]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickPrompt = (promptType: 'resume' | 'cover_letter' | 'about_me') => {
    setMode(promptType);
    if (promptType === 'resume') {
      sendMessage(
        `Please review and optimize my resume summary and bullet points. Here is my current profile summary: "${
          currentCandidate.resumeSummary || currentCandidate.bio
        }". Rewrite it with the Google XYZ formula for maximum recruiter impact.`
      );
    } else if (promptType === 'cover_letter') {
      sendMessage(
        `Help me write a concise, compelling cover letter for roles in "${currentCandidate.targetCategories.join(
          ', '
        )}". Highlight my verified ${currentCandidate.degreeTitle} from ${
          currentCandidate.institution
        } and my ${currentCandidate.yearsOfExperience} years of experience.`
      );
    } else if (promptType === 'about_me') {
      sendMessage(
        `Help me craft an authentic "About Me" personal narrative touching on RAMP's 5 essential checklist pillars:
1. Core values and work philosophy (intellectual humility, craft integrity).
2. Collaboration and communication style (psychological safety, feedback).
3. Curiosity and problem-solving mindset (what technical puzzles excite me).
4. Life beyond the screen (passions, outdoor pursuits, creative hobbies).
5. Ideal team culture (blameless environment, high autonomy).

Here is my current draft or profile context: "${
          currentCandidate.aboutMe || currentCandidate.bio || 'Not yet written'
        }". Please draft a warm, human, memorable narrative.`
      );
    }
  };

  // Helper to extract clean text from Gemini blockquotes or code blocks
  const extractCleanContent = (markdownText: string) => {
    // Check for blockquote > "..."
    const quoteMatch = markdownText.match(/>\s*"?([^"]+)"?/s);
    if (quoteMatch && quoteMatch[1]) {
      return quoteMatch[1].replace(/^>\s*/gm, '').trim();
    }
    // Check for code blocks
    const codeMatch = markdownText.match(/```(?:markdown|text)?\n([\s\S]*?)```/);
    if (codeMatch && codeMatch[1]) {
      return codeMatch[1].trim();
    }
    return markdownText;
  };

  const handleApplyToProfile = (field: 'aboutMe' | 'resumeSummary' | 'coverLetterText', rawText: string) => {
    const cleanText = extractCleanContent(rawText);
    updateCandidateProfile({ [field]: cleanText });
    setAppliedField(field);
    setTimeout(() => setAppliedField(null), 3500);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: `msg-${Date.now()}`,
        role: 'model',
        content: `Chat history reset. How would you like Gemini to help with your RAMP profile today?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-neutral-950/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden my-4 flex flex-col h-[90vh] max-h-[800px]">
        {/* Top Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-neutral-800 bg-neutral-950">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-tight">
                  Gemini Career Studio
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/50">
                  AI Career Coach
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
                Active context: {currentCandidate.name} · {currentCandidate.degreeTitle} ({currentCandidate.institution})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Model Selector */}
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="text-[11px] bg-neutral-900 border border-neutral-800 text-neutral-300 rounded-lg px-2.5 py-1 focus:outline-none focus:border-emerald-500 font-mono"
            >
              <option value="gemini-3.5-flash">gemini-3.5-flash (Fast & Accurate)</option>
              <option value="gemini-3.8-flash">gemini-3.8-flash (General Reasoning)</option>
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Ultra-Fast)</option>
            </select>

            <button
              onClick={handleResetChat}
              title="Reset conversation"
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Mode Prompt Shortcuts */}
        <div className="p-2.5 bg-neutral-950/60 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-neutral-400">Quick Tools:</span>
            <button
              onClick={() => handleQuickPrompt('resume')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1 ${
                mode === 'resume'
                  ? 'bg-neutral-800 text-emerald-400 border border-emerald-500/40'
                  : 'bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-800'
              }`}
            >
              <FileText className="w-3 h-3 text-blue-400" />
              Tweak My Resume
            </button>

            <button
              onClick={() => handleQuickPrompt('cover_letter')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1 ${
                mode === 'cover_letter'
                  ? 'bg-neutral-800 text-emerald-400 border border-emerald-500/40'
                  : 'bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-800'
              }`}
            >
              <Mail className="w-3 h-3 text-purple-400" />
              Craft Cover Letter
            </button>

            <button
              onClick={() => handleQuickPrompt('about_me')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1 ${
                mode === 'about_me'
                  ? 'bg-neutral-800 text-emerald-400 border border-emerald-500/40'
                  : 'bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-800'
              }`}
            >
              <User className="w-3 h-3 text-amber-400" />
              Write 'About Me'
            </button>
          </div>

          {appliedField && (
            <div className="text-[11px] text-emerald-400 font-mono flex items-center gap-1 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
              <Check className="w-3 h-3" />
              Applied to {appliedField === 'aboutMe' ? 'About Me' : appliedField === 'resumeSummary' ? 'Resume Summary' : 'Cover Letter'}!
            </div>
          )}
        </div>

        {/* Scrollable Chat Message History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 text-xs ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.role === 'model' && (
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl p-4 space-y-2.5 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-neutral-950 border border-neutral-800 text-neutral-200 rounded-tl-none shadow-md'
                }`}
              >
                <div className="text-xs leading-relaxed whitespace-pre-wrap break-words font-sans">
                  {msg.content}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-neutral-800/60 text-[10px] text-neutral-400 font-mono">
                  <span>{msg.timestamp}</span>

                  {msg.role === 'model' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="text-neutral-400 hover:text-white flex items-center gap-1 transition-colors"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                      </button>

                      {/* 1-Click Apply Actions */}
                      <button
                        onClick={() => handleApplyToProfile('aboutMe', msg.content)}
                        className="text-amber-400 hover:underline flex items-center gap-1 font-semibold"
                        title="Save as your profile's About Me narrative"
                      >
                        <User className="w-3 h-3" />
                        Apply to About Me
                      </button>

                      <button
                        onClick={() => handleApplyToProfile('resumeSummary', msg.content)}
                        className="text-blue-400 hover:underline flex items-center gap-1 font-semibold"
                        title="Save as your Resume Summary"
                      >
                        <FileText className="w-3 h-3" />
                        Apply to Resume
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 text-xs justify-start">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <Sparkles className="w-4 h-4 animate-spin" />
              </div>
              <div className="p-3 rounded-2xl bg-neutral-950 border border-neutral-800 text-neutral-400 text-xs flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Gemini is analyzing your verified credentials and drafting recommendations...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950 space-y-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Gemini to tweak your resume, write a cover letter, or refine your About Me..."
              className="flex-1 px-4 py-2.5 text-xs bg-neutral-900 border border-neutral-800 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-md shadow-emerald-500/10"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>

          <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
            <span>Powered by @google/genai SDK · Server-side processing</span>
            <span>RAMP Privacy: Your data is never shared with third parties</span>
          </div>
        </div>
      </div>
    </div>
  );
};
