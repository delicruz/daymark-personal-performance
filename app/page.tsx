"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { daymarkFetch, getSupabaseBrowserClient, isSupabaseConfigured } from "./supabase";

type View = "today" | "forecast" | "insights" | "report" | "settings";
type Modal = "morning" | "evening" | "onboarding" | null;
type DaymarkUser = { id: string; email: string; displayName: string };
type UserProfile = { displayName: string; email: string; goal: string; calendarConnected: boolean };
type CheckinRecord = { id: number; entryDate: string; entryType: "morning" | "evening"; energy: number | null; stress: number | null; sleepMinutes: number | null; workload: string | null; plannedFocusMinutes: number | null; productivity: number | null; focusedMinutes: number | null; reflection: string | null; prediction: number | null };
type PriorityRecord = { id: number; title: string; impact: string; completed: boolean };
type DaymarkData = { user: DaymarkUser; profile: UserProfile | null; checkins: CheckinRecord[]; latestMorning: CheckinRecord | null; priorities: PriorityRecord[]; forecast: number; baselineDays: number };
type CheckinPayload = { entryType: "morning" | "evening"; energy: number; stress: number; focusMinutes: number; sleepMinutes: number; workload: string; productivity: number; reflection: string };

const demoData: DaymarkData = {
  user: { id: "demo", email: "demo@daymark.test", displayName: "Tri Dung" },
  profile: { displayName: "Tri Dung", email: "demo@daymark.test", goal: "Improve daily focus", calendarConnected: false },
  checkins: [],
  latestMorning: { id: 0, entryDate: "", entryType: "morning", energy: 4, stress: 2, sleepMinutes: 462, workload: "normal", plannedFocusMinutes: 120, productivity: null, focusedMinutes: null, reflection: null, prediction: 74 },
  priorities: [
    { id: -1, title: "Finish project proposal", impact: "HIGH IMPACT", completed: true },
    { id: -2, title: "Review research notes", impact: "45 MIN", completed: true },
    { id: -3, title: "Plan tomorrow's focus block", impact: "20 MIN", completed: false },
  ],
  forecast: 74,
  baselineDays: 0,
};

async function daymarkAction(payload: Record<string, unknown>) {
  const response = await daymarkFetch("/api/daymark", { method: "POST", body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Your changes could not be saved.");
  return result as DaymarkData;
}

function AuthDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<"email" | "google" | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const sendEmailLink = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("email");
    setStatus("");
    const { error } = await getSupabaseBrowserClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(null);
    setStatus(error ? error.message : "Check your inbox — your secure sign-in link is on its way.");
  };

  const signInWithGoogle = async () => {
    setBusy("google");
    setStatus("");
    const { error } = await getSupabaseBrowserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setBusy(null);
      setStatus(error.message);
    }
  };

  return <div className="auth-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="auth-close" onClick={onClose} aria-label="Close sign in">×</button><Logo dark /><span className="auth-kicker">YOUR PRIVATE WORKSPACE</span><h2 id="auth-title">Welcome to Daymark.</h2><p>Sign in without another password. We’ll send a secure link to your email.</p><button className="google-auth" onClick={() => void signInWithGoogle()} disabled={busy !== null}><span aria-hidden="true">G</span>{busy === "google" ? "Opening Google…" : "Continue with Google"}</button><div className="auth-divider"><span>or use email</span></div><form onSubmit={sendEmailLink}><label htmlFor="auth-email">EMAIL ADDRESS</label><input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /><button type="submit" disabled={busy !== null}>{busy === "email" ? "Sending link…" : "Email me a sign-in link"}<span className="solid-arrow" aria-hidden="true" /></button></form>{status ? <p className="auth-status" role="status">{status}</p> : null}<small>By continuing, you agree to use Daymark for personal reflection. Your check-ins remain tied to your private account.</small></section></div>;
}

const week = [
  { day: "Mon", date: "12", score: 74, tone: "good", note: "2h focus block" },
  { day: "Tue", date: "13", score: 61, tone: "medium", note: "Meeting-heavy" },
  { day: "Wed", date: "14", score: 82, tone: "great", note: "Best focus day" },
  { day: "Thu", date: "15", score: 69, tone: "good", note: "Steady outlook" },
  { day: "Fri", date: "16", score: 55, tone: "medium", note: "High workload" },
  { day: "Sat", date: "17", score: 71, tone: "good", note: "Light planning" },
  { day: "Sun", date: "18", score: 78, tone: "great", note: "Well recovered" },
];

const navItems: { id: View; label: string; icon: string }[] = [
  { id: "today", label: "Today", icon: "☀" },
  { id: "forecast", label: "Forecast", icon: "↗" },
  { id: "insights", label: "Insights", icon: "✦" },
  { id: "report", label: "Weekly report", icon: "▤" },
  { id: "settings", label: "Data & settings", icon: "⚙" },
];

const tourSteps = [
  { target: "navigation", eyebrow: "YOUR WORKSPACE", title: "Everything has a home.", body: "Move between today’s plan, future forecasts, personal patterns, weekly reports and your data controls." },
  { target: "outlook", eyebrow: "START HERE", title: "See tomorrow at a glance.", body: "Your forecast is always a range with a confidence level—never a promise or a judgement." },
  { target: "factors", eyebrow: "STAY INFORMED", title: "Always see the why.", body: "Positive signals and risk factors explain what moved the outlook, using your own recent patterns." },
  { target: "checkin", eyebrow: "BUILD YOUR BASELINE", title: "A minute makes it personal.", body: "Quick check-ins teach Daymark your energy, stress and sleep rhythm without invasive monitoring." },
  { target: "priorities", eyebrow: "TURN INSIGHT INTO ACTION", title: "Keep the day intentional.", body: "Choose a small set of meaningful priorities, then reflect on what actually happened at day’s end." },
] as const;

const factors = [
  { label: "Sleep quality", value: "+11", positive: true, detail: "7h 42m · above your average" },
  { label: "Focus time", value: "+8", positive: true, detail: "Two uninterrupted blocks" },
  { label: "Meeting load", value: "−7", positive: false, detail: "3 meetings · 2h 15m total" },
  { label: "Workload", value: "−4", positive: false, detail: "Slightly above your normal" },
];

const faqs = [
  { category: "Forecasts", question: "What does Daymark’s productivity score mean?", answer: "It is a personal capacity forecast from 0 to 100, built to help you plan your day. It is not a grade, a promise, or a comparison with other people. Daymark always pairs the score with a range and the signals that influenced it." },
  { category: "Forecasts", question: "How long does it take to build an accurate baseline?", answer: "Useful guidance starts with your first check-in. Confidence improves as you record more mornings and evening outcomes, with the first meaningful personal baseline developing over roughly 30 recorded days." },
  { category: "Data", question: "What information do I need to share?", answer: "A morning check-in can include sleep duration, energy, stress, planned focus time and workload. Evening reviews add your productivity outcome and an optional reflection. Every input is visible and chosen by you." },
  { category: "Privacy", question: "Can my employer see or use my forecasts?", answer: "No. Daymark is designed as an individual reflection tool, not an employee-ranking system. Your workspace is tied to your account, and forecasts are not presented as medical or employment assessments." },
  { category: "Calendar", question: "What does the calendar connection read?", answer: "Daymark only needs event timing and availability to estimate meeting load and open focus windows. It does not need meeting titles, descriptions, attendees, messages or document contents." },
  { category: "Data", question: "Can I export or permanently delete my information?", answer: "Yes. Data & Settings lets you download your profile, check-ins, priorities and outcomes as JSON. You can also permanently delete the Daymark records attached to your account." },
  { category: "Accounts", question: "How do I sign in?", answer: "Use a secure email sign-in link or continue with Google when that provider is enabled. Daymark uses Supabase Auth to verify your session before any private information is loaded or saved." },
  { category: "Forecasts", question: "Does Daymark use artificial intelligence?", answer: "Daymark begins with transparent rules and clearly weighted signals. Personalised modelling should only begin when you have enough labelled outcomes, and every forecast should remain explainable rather than becoming a black box." },
] as const;

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`logo ${dark ? "logo-dark" : ""}`}>
      <span className="logo-mark" aria-hidden="true"><i /><i /><i /></span>
      <strong>Daymark</strong>
    </span>
  );
}

function GuidedTour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const cardRef = useRef<HTMLElement>(null);
  const [highlight, setHighlight] = useState({ top: 20, left: 20, width: 120, height: 80 });
  const [cardPosition, setCardPosition] = useState({ top: 120, left: 120, width: 340 });
  const current = tourSteps[step];

  const finish = useCallback(() => {
    localStorage.setItem("daymark-guided-tour:v1", "complete");
    onClose();
  }, [onClose]);

  const updatePosition = useCallback(() => {
    const element = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`);
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const inset = 8;
    const width = Math.min(340, window.innerWidth - 32);
    const estimatedHeight = 230;
    const gap = 16;
    const left = Math.max(inset, rect.left - inset);
    const top = Math.max(inset, rect.top - inset);
    setHighlight({
      top,
      left,
      width: Math.min(window.innerWidth - left - inset, rect.width + inset * 2),
      height: Math.min(window.innerHeight - top - inset, rect.height + inset * 2),
    });

    const canFitRight = rect.right + gap + width <= window.innerWidth - 16;
    let cardLeft = canFitRight ? rect.right + gap : Math.min(window.innerWidth - width - 16, Math.max(16, rect.left));
    let cardTop = canFitRight ? Math.min(window.innerHeight - estimatedHeight - 16, Math.max(16, rect.top)) : rect.bottom + gap;
    if (cardTop + estimatedHeight > window.innerHeight) cardTop = Math.max(16, rect.top - estimatedHeight - gap);
    cardLeft = Math.max(16, cardLeft);
    setCardPosition({ top: cardTop, left: cardLeft, width });
  }, [current.target]);

  useEffect(() => {
    const element = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(updatePosition, 320);
    cardRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") finish(); };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [current.target, finish, updatePosition]);

  return <div className="tour-layer"><div className="tour-catcher" /><div className="tour-highlight" style={highlight} /><section ref={cardRef} tabIndex={-1} className="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" style={cardPosition}><div className="tour-topline"><span>{current.eyebrow}</span><button onClick={finish} aria-label="Close guided tour">×</button></div><h2 id="tour-title">{current.title}</h2><p>{current.body}</p><div className="tour-progress" aria-label={`Step ${step + 1} of ${tourSteps.length}`}>{tourSteps.map((item, index) => <i key={item.target} className={index === step ? "active" : index < step ? "complete" : ""} />)}</div><div className="tour-actions"><button className="tour-skip" onClick={finish}>Skip tour</button><div>{step > 0 && <button className="tour-back" onClick={() => setStep(step - 1)}>Back</button>}<button className="tour-next" onClick={() => step === tourSteps.length - 1 ? finish() : setStep(step + 1)}>{step === tourSteps.length - 1 ? "Finish" : "Next"}<span className="solid-arrow" aria-hidden="true" /></button></div></div></section></div>;
}

function FaqSection() {
  const [query, setQuery] = useState("");
  const [openQuestion, setOpenQuestion] = useState<string>(faqs[0].question);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleFaqs = normalizedQuery ? faqs.filter((faq) => `${faq.category} ${faq.question} ${faq.answer}`.toLowerCase().includes(normalizedQuery)) : faqs;

  return <section className="faq-section" id="faq"><div className="faq-heading"><div><span className="section-number">04 / COMMON QUESTIONS</span><h2>Clear answers,<br /><em>before you begin.</em></h2></div><label className="faq-search"><span aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search questions" aria-label="Search frequently asked questions" />{query ? <button onClick={() => setQuery("")} aria-label="Clear FAQ search">×</button> : null}</label></div><div className="faq-layout"><aside><strong>{visibleFaqs.length}</strong><span>{visibleFaqs.length === 1 ? "ANSWER" : "ANSWERS"}</span><p>Everything important about forecasts, privacy and your data—without the small print.</p></aside><div className="faq-list">{visibleFaqs.length ? visibleFaqs.map((faq, index) => { const open = openQuestion === faq.question; const answerId = `faq-answer-${index}`; return <article className={open ? "open" : ""} key={faq.question}><button aria-expanded={open} aria-controls={answerId} onClick={() => setOpenQuestion(open ? "" : faq.question)}><span><small>{faq.category}</small>{faq.question}</span><i aria-hidden="true" /></button><div className="faq-answer" id={answerId} hidden={!open}><p>{faq.answer}</p></div></article>; }) : <div className="faq-empty"><strong>No matching questions.</strong><p>Try searching for “privacy”, “score”, “calendar” or “data”.</p><button onClick={() => setQuery("")}>Show every answer</button></div>}</div></div></section>;
}

function Marketing({ onStart, onDemo, onSignIn }: { onStart: () => void; onDemo: () => void; onSignIn: () => void }) {
  return (
    <main className="marketing">
      <header className="marketing-nav">
        <Logo />
        <nav aria-label="Main navigation">
          <a href="#how">How it works</a>
          <a href="#privacy">Privacy</a>
          <a href="#science">Our approach</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="nav-actions">
          <button className="link-button" onClick={onSignIn}>Sign in</button>
          <button className="small-cta" onClick={onStart}>Start free <span className="solid-arrow" aria-hidden="true" /></button>
        </div>
      </header>

      <section className="hero-shell">
        <div className="hero-copy">
          <div className="eyebrow"><span>✦</span> Personal capacity, made visible</div>
          <h1>Know your capacity.<br /><em>Plan your best work.</em></h1>
          <p className="hero-lead">
            Daymark turns your energy, routines and calendar into one explainable forecast for the day ahead.
          </p>
          <div className="hero-actions">
            <button className="primary-cta" onClick={onStart}>See tomorrow clearly <span className="solid-arrow" aria-hidden="true" /></button>
            <button className="demo-link" onClick={onDemo}><span className="play" aria-hidden="true" /> Explore the live demo</button>
          </div>
          <div className="trust-line">
            <span>✓ Your baseline</span><span>✓ Your explanation</span><span>✓ Your data</span>
          </div>
        </div>

        <div className="hero-product" aria-label="Example productivity forecast">
          <div className="product-window">
            <div className="window-top">
              <Logo dark />
              <div className="window-user"><span>Wed, Aug 12</span><b>TD</b></div>
            </div>
            <div className="mini-dashboard">
              <div className="mini-side">
                <span className="active">⌂</span><span>↗</span><span>⌁</span><span>▤</span>
              </div>
              <div className="mini-content">
                <p className="mini-kicker">TOMORROW’S OUTLOOK</p>
                <h2>A strong day for<br />deep work.</h2>
                <div className="score-row">
                  <div className="score-ring" style={{ "--score": 74 } as React.CSSProperties}>
                    <div><strong>74</strong><span>/100</span></div>
                  </div>
                  <div className="range-copy"><span className="confidence-dot" /> Moderate confidence<strong>Expected range 67–80</strong><small>Based on 24 recorded days</small></div>
                </div>
                <div className="signal-row">
                  <div><span className="signal-icon up">↑</span><p>POSITIVE SIGNAL</p><strong>Good recent sleep</strong><small>+11 to your outlook</small></div>
                  <div><span className="signal-icon down">↓</span><p>WATCH OUT FOR</p><strong>Afternoon meetings</strong><small>−7 from your outlook</small></div>
                </div>
                <div className="recommendation"><span>✦</span><div><small>DAYMARK SUGGESTS</small><strong>Protect 9–11am for your hardest priority.</strong></div><b>→</b></div>
              </div>
            </div>
          </div>
          <div className="float-card float-one"><span>FOCUS WINDOW</span><strong>9:00–11:00</strong><small>Best time for deep work</small></div>
          <div className="float-card float-two"><span>DATA CONTROL</span><strong>Private by default</strong><small>You decide what to connect</small></div>
        </div>
      </section>

      <section className="metrics-band" aria-label="Product benefits">
        <div><i aria-hidden="true">☀</i><strong>Check in</strong><span>60 seconds each day</span></div>
        <div><i aria-hidden="true">↗</i><strong>Understand</strong><span>See what shapes tomorrow</span></div>
        <div><i aria-hidden="true">◇</i><strong>Act</strong><span>Get one useful next move</span></div>
        <p>One calm answer.<br /><em>Every morning.</em></p>
      </section>

      <section className="how-section" id="how">
        <div className="section-intro">
          <span className="section-number">01 / HOW IT WORKS</span>
          <h2>A useful forecast,<br /><em>without the surveillance.</em></h2>
          <p>Daymark uses small, meaningful signals chosen by you. No keystrokes, screenshots, message contents or hidden monitoring.</p>
        </div>
        <div className="steps-grid">
          <article className="step-primary"><span>01 · CHECK IN</span><div className="step-symbol">☼</div><h3>A minute of input.<br />A day of context.</h3><p>Share sleep, energy, stress and your three priorities. Nothing invasive, and nothing hidden.</p><div className="step-preview checkin-preview"><span><small>ENERGY</small><b>4 / 5</b></span><span><small>STRESS</small><b>2 / 5</b></span><span><small>SLEEP</small><b>7h 42m</b></span></div></article>
          <article><span>02 · UNDERSTAND</span><div className="step-symbol">▦</div><h3>See what is shaping tomorrow.</h3><p>Your forecast connects wellbeing with meeting load and available focus time.</p><div className="step-preview signal-preview"><span><i className="positive-bg" />Sleep quality <b>+11</b></span><span><i className="negative-bg" />Meeting load <b>−7</b></span></div></article>
          <article><span>03 · ACT</span><div className="step-symbol">✦</div><h3>Leave with one clear move.</h3><p>No overwhelming advice feed—just the most useful adjustment for the day.</p><div className="step-preview action-preview"><small>BEST NEXT MOVE</small><strong>Protect 9–11am for your hardest priority.</strong></div></article>
        </div>
      </section>

      <section className="science-section" id="science">
        <div>
          <span className="section-number light">02 / DESIGNED AROUND YOU</span>
          <h2>Your rhythm is<br />the real benchmark.</h2>
        </div>
        <div className="science-copy">
          <p>Daymark compares each day to <strong>your own patterns</strong>—not someone else’s output. Early insights use clear rules. Personal forecasts only begin when there is enough data to be useful.</p>
          <ul><li><span>01</span>Ranges instead of false precision</li><li><span>02</span>Every prediction includes a “why”</li><li><span>03</span>Correlations are never presented as causes</li></ul>
        </div>
      </section>

      <section className="privacy-section" id="privacy">
        <div className="privacy-card">
          <div className="privacy-icon">◇</div>
          <span className="section-number">03 / PRIVACY PROMISE</span>
          <h2>Built for reflection,<br />not employee surveillance.</h2>
          <p>Your forecast belongs to you. Daymark does not rank people, sell behavioural data, or make employment decisions.</p>
          <div className="privacy-points"><span>Granular consent</span><span>Export any time</span><span>Permanent deletion</span><span>No calendar contents</span></div>
        </div>
      </section>

      <FaqSection />

      <section className="final-cta">
        <p>MAKE TOMORROW MORE INTENTIONAL</p>
        <h2>Start noticing what<br /><em>moves your day.</em></h2>
        <button className="primary-cta light-cta" onClick={onStart}>Build my baseline <span className="solid-arrow" aria-hidden="true" /></button>
      </section>

      <footer className="marketing-footer"><Logo /><span>© 2026 Daymark</span><div><a href="#privacy">Privacy</a><a href="#how">How it works</a><a href="#faq">FAQ</a></div></footer>
    </main>
  );
}

function Sidebar({ view, setView, exit, startTour, data }: { view: View; setView: (view: View) => void; exit: () => void; startTour: () => void; data: DaymarkData }) {
  const initials = data.user.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <aside className="sidebar">
      <Logo dark />
      <nav aria-label="Dashboard navigation" data-tour="navigation">
        {navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} aria-label={item.label} data-label={item.label} aria-current={view === item.id ? "page" : undefined} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}
      </nav>
      <div className="baseline-box"><span>BASELINE</span><strong>{data.baselineDays} of 30 days</strong><div><i style={{ width: `${Math.min(100, data.baselineDays / 30 * 100)}%` }} /></div><small>{Math.max(0, 30 - data.baselineDays)} more days to improve accuracy</small></div>
      <button className="tour-restart" aria-label="Open guided tour" data-label="Guided tour" onClick={startTour}><span>?</span><strong>Guided tour</strong></button>
      <button className="profile-block" onClick={exit}><b>{initials || "DM"}</b><span><strong>{data.user.displayName}</strong><small>{data.user.email === "demo@daymark.test" ? "Demo workspace" : "Personal workspace"}</small></span><em>⋯</em></button>
    </aside>
  );
}

function AppHeader({ title, subtitle, setModal }: { title: string; subtitle: string; setModal: (modal: Modal) => void }) {
  return (
    <header className="app-header"><div><p>{subtitle}</p><h1>{title}</h1></div><div className="header-actions"><button className="icon-button" aria-label="Notifications">♢<i /></button><button className="outline-button" onClick={() => setModal("morning")}>☼ Morning check-in</button><button className="dark-button" onClick={() => setModal("evening")}>Evening review <span>→</span></button></div></header>
  );
}

function Today({ setModal, data, onAddPriority, onTogglePriority }: { setModal: (modal: Modal) => void; data: DaymarkData; onAddPriority: (title: string) => Promise<void>; onTogglePriority: (id: number, completed: boolean) => Promise<void> }) {
  const [addingPriority, setAddingPriority] = useState(false);
  const [priorityTitle, setPriorityTitle] = useState("");
  const morning = data.latestMorning;
  const completed = data.priorities.filter((priority) => priority.completed).length;
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const dayLabel = new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long" }).format(now).toUpperCase();
  const tomorrowLabel = new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long" }).format(tomorrow).toUpperCase();
  const firstName = data.user.displayName.split(/\s+/)[0] || "there";
  const sleepHours = morning?.sleepMinutes ? `${Math.floor(morning.sleepMinutes / 60)}h ${morning.sleepMinutes % 60}m` : "Not recorded";
  const submitPriority = async (event: FormEvent) => { event.preventDefault(); const title = priorityTitle.trim(); if (!title) return; await onAddPriority(title); setPriorityTitle(""); setAddingPriority(false); };
  return (
    <>
      <AppHeader title={`Good morning, ${firstName}.`} subtitle={dayLabel} setModal={setModal} />
      <div className="dashboard-grid">
        <section className="outlook-card" data-tour="outlook">
          <div className="card-label"><span>✦</span> TOMORROW’S PRODUCTIVITY OUTLOOK <button aria-label="More options">•••</button></div>
          <div className="outlook-main">
            <div><span className="outlook-date">{tomorrowLabel}</span><h2>A strong day for<br /><em>deep work.</em></h2><p>{data.baselineDays ? "This outlook now reflects your saved morning check-ins." : "Complete your first morning check-in to begin a personal baseline."}</p></div>
            <div className="large-score-ring" style={{ "--score": data.forecast } as React.CSSProperties}><div><strong>{data.forecast}</strong><span>/100</span><small>GOOD</small></div></div>
          </div>
          <div className="confidence-line"><span><i /> {data.baselineDays >= 14 ? "Moderate" : "Early"} confidence</span><strong>Expected range {data.forecast - 7}–{data.forecast + 6}</strong><small>Based on {data.baselineDays} recorded {data.baselineDays === 1 ? "day" : "days"}</small></div>
          <div className="recommendation wide"><span>✦</span><div><small>YOUR BEST NEXT MOVE</small><strong>Protect 9–11am for your hardest priority.</strong><p>Your energy is typically highest before your first meeting.</p></div><button>View schedule <span>→</span></button></div>
        </section>

        <section className="checkin-card" data-tour="checkin">
          <div className="card-label">TODAY’S CHECK-IN {morning ? <span className="complete-pill">✓ SAVED</span> : <span>NOT STARTED</span>}</div>
          <div className="wellbeing-row"><div><span>☼</span><small>ENERGY</small><strong>{morning?.energy ?? "–"} / 5</strong></div><div><span>◌</span><small>FOCUS PLAN</small><strong>{morning?.plannedFocusMinutes ?? "–"} min</strong></div><div><span>⌁</span><small>STRESS</small><strong>{morning?.stress ?? "–"} / 5</strong></div></div>
          <div className="sleep-line"><span>☾</span><div><small>LAST NIGHT’S SLEEP</small><strong>{sleepHours} {morning && <em>{(morning.sleepMinutes ?? 0) >= 420 ? "Good" : "Low"}</em>}</strong></div></div>
          <button className="text-action" onClick={() => setModal("morning")}>{morning ? "Edit" : "Start"} check-in <span>→</span></button>
        </section>

        <section className="factors-card" data-tour="factors">
          <div className="card-label">WHAT’S SHAPING TOMORROW <button>Why this prediction? ↗</button></div>
          <div className="factor-list">{factors.map((factor) => <div className="factor" key={factor.label}><span className={factor.positive ? "factor-up" : "factor-down"}>{factor.positive ? "↑" : "↓"}</span><div><strong>{factor.label}</strong><small>{factor.detail}</small></div><b className={factor.positive ? "positive" : "negative"}>{factor.value}</b></div>)}</div>
        </section>

        <section className="calendar-card">
          <div className="card-label">TOMORROW’S CALENDAR <button>Open calendar ↗</button></div>
          <div className="calendar-stats"><div><strong>3</strong><span>Meetings</span></div><div><strong>2h 15m</strong><span>Meeting time</span></div><div><strong>4h 30m</strong><span>Open focus time</span></div></div>
          <div className="timeline"><span>8am</span><div className="focus-block" style={{ gridColumn: "2 / 5" }}>Best focus window <b>9–11am</b></div><div className="meeting-block" style={{ gridColumn: "5" }}>Meet</div><div className="meeting-block light" style={{ gridColumn: "7 / 9" }}>Meetings</div><span>5pm</span></div>
        </section>

        <section className="priorities-card" data-tour="priorities">
          <div className="card-label">TODAY’S PRIORITIES <span>{completed} OF {data.priorities.length} COMPLETE</span></div>
          {data.priorities.length === 0 && <p className="empty-state">Choose one meaningful outcome for today.</p>}
          {data.priorities.map((priority) => <label key={priority.id}><input type="checkbox" checked={priority.completed} onChange={(event) => void onTogglePriority(priority.id, event.target.checked)} /><span>{priority.title}</span><small>{priority.impact}</small></label>)}
          {addingPriority ? <form className="priority-form" onSubmit={submitPriority}><input aria-label="New priority" placeholder="What matters most today?" value={priorityTitle} onChange={(event) => setPriorityTitle(event.target.value)} maxLength={180} /><button type="submit">Add</button><button type="button" onClick={() => setAddingPriority(false)}>Cancel</button></form> : <button className="text-action" onClick={() => setAddingPriority(true)}>+ Add priority</button>}
        </section>

        <section className="trend-card">
          <div className="card-label">7-DAY TREND <button>View insights →</button></div>
          <div className="trend-summary"><div><strong>71</strong><span>Weekly average</span></div><em>↗ 6% vs last week</em></div>
          <div className="mini-bars">{[58, 67, 73, 69, 82, 76, 71].map((height, index) => <div key={index}><span style={{ height: `${height}%` }} className={index === 4 ? "peak" : ""} /><small>{["T", "W", "T", "F", "S", "S", "M"][index]}</small></div>)}</div>
        </section>
      </div>
    </>
  );
}

function Forecast({ setModal }: { setModal: (modal: Modal) => void }) {
  return <><AppHeader title="Your week ahead." subtitle="FORECAST · 12–18 AUGUST" setModal={setModal} /><section className="page-card forecast-hero"><div><span className="section-number">7-DAY OUTLOOK</span><h2>Plan demanding work for<br /><em>Wednesday morning.</em></h2><p>Your forecast combines daily check-ins, recent patterns and calendar availability. It will update as your week changes.</p></div><div className="forecast-average"><small>WEEKLY OUTLOOK</small><strong>70</strong><span>/100 · GOOD</span></div></section><section className="week-grid">{week.map((day, index) => <article key={day.day} className={index === 2 ? "best-day" : ""}><div><span>{day.day}</span><b>{day.date}</b></div><div className={`day-score ${day.tone}`}>{day.score}</div><strong>{day.note}</strong><small>{day.score >= 75 ? "Protect focus time" : day.score < 60 ? "Reduce priorities" : "Balanced workload"}</small>{index === 2 && <em>BEST DAY</em>}</article>)}</section><div className="two-column"><section className="page-card"><div className="card-label">WEEKLY RISKS</div><div className="risk-item"><span>!</span><div><strong>Friday workload is unusually high</strong><p>Five planned tasks and 3h 30m in meetings may limit deep work.</p></div><button>Adjust plan →</button></div><div className="risk-item positive-risk"><span>↑</span><div><strong>Wednesday has ideal focus conditions</strong><p>Your best energy window is clear from 8:30am to midday.</p></div><button>Protect time →</button></div></section><section className="page-card"><div className="card-label">FORECAST CONFIDENCE</div><h3 className="confidence-title">Moderate, improving</h3><div className="confidence-meter"><i style={{ width: "78%" }} /></div><p>Daymark has 24 complete days. Six more will unlock your first fully personalised model.</p><span className="info-pill">24 / 30 DAYS</span></section></div></>;
}

function Insights({ setModal }: { setModal: (modal: Modal) => void }) {
  const correlations = [{ label: "7+ hours of sleep", change: "+14", note: "Strong positive association", width: 88 }, { label: "2+ hours of focus time", change: "+10", note: "Positive association", width: 70 }, { label: "More than 3 meetings", change: "−9", note: "Negative association", width: 62 }, { label: "High morning stress", change: "−12", note: "Strong negative association", width: 78 }];
  return <><AppHeader title="Patterns worth noticing." subtitle="INSIGHTS · LAST 30 DAYS" setModal={setModal} /><div className="insight-stats"><article><span>AVERAGE SCORE</span><strong>71</strong><em>↗ 6% this month</em></article><article><span>PRIORITIES COMPLETED</span><strong>82%</strong><em>↗ 9% this month</em></article><article><span>FOCUS TIME</span><strong>2h 18m</strong><em>Daily average</em></article><article><span>BEST DAY</span><strong>Wed</strong><em>Average score 79</em></article></div><div className="two-column insight-columns"><section className="page-card"><div className="card-label">YOUR STRONGEST SIGNALS <span>ASSOCIATION, NOT CAUSATION</span></div><div className="correlation-list">{correlations.map((item) => <div key={item.label}><div className="correlation-copy"><span><strong>{item.label}</strong><small>{item.note}</small></span><b className={item.change.startsWith("+") ? "positive" : "negative"}>{item.change} pts</b></div><div className="correlation-bar"><i className={item.change.startsWith("+") ? "positive-bg" : "negative-bg"} style={{ width: `${item.width}%` }} /></div></div>)}</div></section><section className="page-card experiment-card"><span className="section-number">SUGGESTED EXPERIMENT</span><div className="experiment-symbol">✦</div><h3>Try a meeting-free morning.</h3><p>On days with no meetings before 11am, your average productivity is 12 points higher.</p><button className="dark-button">Plan experiment <span>→</span></button></section></div><section className="page-card chart-card"><div className="card-label">PRODUCTIVITY OVER TIME <div><button className="selected">30 DAYS</button><button>90 DAYS</button></div></div><div className="line-chart"><div className="chart-y"><span>90</span><span>70</span><span>50</span><span>30</span></div><div className="chart-area"><div className="average-line"><span>Your average · 71</span></div><div className="chart-bars">{[55,62,59,70,68,74,66,78,81,72,69,77,84,79,73,76,82,88,79,71,75,83,80,86,74,78,81,85,82,87].map((n,i)=><i key={i} style={{height:`${n}%`}} />)}</div><div className="chart-x"><span>14 Jul</span><span>21 Jul</span><span>28 Jul</span><span>4 Aug</span><span>11 Aug</span></div></div></div></section></>;
}

function Report({ setModal }: { setModal: (modal: Modal) => void }) {
  return <><AppHeader title="A week in perspective." subtitle="WEEKLY REPORT · 5–11 AUGUST" setModal={setModal} /><section className="report-cover"><span>WEEK 32</span><div><p>YOUR WEEKLY SUMMARY</p><h2>You made space for<br /><em>what mattered.</em></h2><small>Three strong focus days · 82% of priorities completed</small></div><div className="report-score"><strong>76</strong><span>WEEKLY SCORE</span><em>↗ 6 points</em></div></section><div className="report-metrics"><article><span>PRIORITIES</span><strong>14 / 17</strong><div><i style={{width:"82%"}} /></div><small>82% complete</small></article><article><span>FOCUS TIME</span><strong>11h 34m</strong><div><i style={{width:"72%"}} /></div><small>1h 39m daily average</small></article><article><span>MEETING TIME</span><strong>8h 15m</strong><div><i className="orange" style={{width:"48%"}} /></div><small>12 meetings total</small></article></div><div className="two-column"><section className="page-card"><div className="card-label">THIS WEEK’S STORY</div><h3 className="story-title">Your best work happened before noon.</h3><p className="story-copy">Four of your five highest-scoring focus sessions started before 10am. Days with a protected morning block averaged <strong>12 points higher</strong> than days without one.</p><div className="story-callout"><span>✦</span><p><small>TRY THIS NEXT WEEK</small><strong>Reserve Monday, Wednesday and Thursday mornings for priority work.</strong></p></div></section><section className="page-card"><div className="card-label">DAILY SCORES</div><div className="report-days">{week.slice(0,7).map(d=><div key={d.day}><span style={{height:`${d.score}%`}} className={d.score > 78 ? "high" : ""}><b>{d.score}</b></span><small>{d.day}</small></div>)}</div></section></div><button className="download-report" onClick={() => window.print()}>↓ Download weekly report</button></>;
}

function Settings({ setModal, data, onCalendarToggle, onProfileUpdate, onDelete }: { setModal: (modal: Modal) => void; data: DaymarkData; onCalendarToggle: (connected: boolean) => Promise<void>; onProfileUpdate: (displayName: string, goal: string) => Promise<void>; onDelete: () => Promise<void> }) {
  const [displayName, setDisplayName] = useState(data.profile?.displayName ?? data.user.displayName);
  const [goal, setGoal] = useState(data.profile?.goal ?? "Improve daily focus");
  const [saved, setSaved] = useState(false);
  const connected = Boolean(data.profile?.calendarConnected);
  const exportData = () => { const exported = JSON.stringify({ product: "Daymark", exportedAt: new Date().toISOString(), user: data.user, profile: data.profile, checkins: data.checkins, priorities: data.priorities }, null, 2); const url = URL.createObjectURL(new Blob([exported], {type:"application/json"})); const a=document.createElement("a"); a.href=url; a.download="daymark-data.json"; a.click(); URL.revokeObjectURL(url); };
  const saveProfile = async (event: FormEvent) => { event.preventDefault(); await onProfileUpdate(displayName, goal); setSaved(true); window.setTimeout(() => setSaved(false), 1800); };
  return <><AppHeader title="Your data, your choices." subtitle="DATA & SETTINGS" setModal={setModal} /><div className="settings-layout"><nav aria-label="Settings sections"><button className="active">Profile</button><button>Productivity score</button><button>Integrations</button><button>Reminders</button><button>Privacy & consent</button><button>Export & deletion</button></nav><div className="settings-content"><section className="settings-section"><div><h2>Personal workspace</h2><p>Your account and preferences are stored privately and attached to your signed-in identity.</p></div><form className="profile-form" onSubmit={saveProfile}><label>DISPLAY NAME<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} /></label><label>ACCOUNT EMAIL<input value={data.user.email} disabled /></label><label>PRIMARY GOAL<select value={goal} onChange={(event) => setGoal(event.target.value)}><option>Improve daily focus</option><option>Plan more realistically</option><option>Build healthier routines</option></select></label><button className="dark-button" type="submit">{saved ? "✓ Saved" : "Save profile"}</button></form></section><section className="settings-section"><div><h2>Calendar connection</h2><p>Daymark only reads event times and availability. Titles, descriptions, attendees and meeting contents are never stored.</p></div><div className="integration-row"><span className="calendar-logo">31</span><div><strong>Google Calendar</strong><small>{connected ? "Enabled for your workspace" : "Not connected"}</small></div><button className={connected ? "connected-button" : "outline-button"} onClick={()=>void onCalendarToggle(!connected)}>{connected ? "✓ Connected" : "Connect"}</button></div></section><section className="settings-section"><div><h2>Productivity score</h2><p>Your early score combines explicit inputs. These weights can be personalised once enough labelled outcomes exist.</p></div>{[["Energy",35],["Sleep duration",25],["Stress",20],["Planned focus & workload",20]].map(([label,value])=><div className="weight-row" key={label}><span>{label}</span><div><i style={{width:`${value}%`}} /></div><strong>{value}%</strong></div>)}</section><section className="settings-section privacy-control"><div><h2>Privacy controls</h2><p>Download a complete copy of your information or permanently remove it.</p></div><div className="control-row"><span>↧</span><div><strong>Export my data</strong><small>Download your real check-ins, outcomes, profile and priorities as JSON.</small></div><button onClick={exportData}>Download</button></div><div className="control-row danger"><span>×</span><div><strong>Delete my account and data</strong><small>This removes all Daymark records associated with this account.</small></div><button onClick={()=>void onDelete()}>Delete data</button></div></section><div className="privacy-note"><span>◇</span><p><strong>Private by default.</strong> Every database query is scoped to your signed-in user ID.</p></div></div></div></>;
}

function CheckInModal({ modal, close, onSaved }: { modal: Exclude<Modal, null>; close: () => void; onSaved: (payload: CheckinPayload) => Promise<void> }) {
  const [step, setStep] = useState(1);
  const [energy, setEnergy] = useState(4);
  const [stress, setStress] = useState(2);
  const [focus, setFocus] = useState(120);
  const [sleep, setSleep] = useState("7h 42m");
  const [workload, setWorkload] = useState("normal");
  const [productivity, setProductivity] = useState(8);
  const [reflection, setReflection] = useState("");
  const [saving, setSaving] = useState(false);
  const onboarding = modal === "onboarding";
  const evening = modal === "evening";
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [close]);
  const sleepMinutes = useMemo(() => { const hours = Number(sleep.match(/(\d+)\s*h/i)?.[1] ?? 0); const minutes = Number(sleep.match(/(\d+)\s*m/i)?.[1] ?? 0); return hours * 60 + minutes; }, [sleep]);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (onboarding && step < 3) { setStep(step + 1); return; } setSaving(true); try { await onSaved({ entryType: evening ? "evening" : "morning", energy, stress, focusMinutes: focus, sleepMinutes, workload, productivity, reflection }); } finally { setSaving(false); } };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e)=>{if(e.target===e.currentTarget) close();}}><form className="checkin-modal" onSubmit={submit}><button type="button" className="modal-close" onClick={close} aria-label="Close">×</button>{onboarding ? <><span className="modal-kicker">SETUP · {step} OF 3</span><div className="modal-progress"><i style={{width:`${step/3*100}%`}} /></div>{step===1&&<><h2>What would you like<br />to improve?</h2><p>Choose your main goal. You can change this later.</p><div className="goal-options"><label><input aria-label="Improve daily focus" type="radio" name="goal" defaultChecked/><span>✦</span><strong>Improve daily focus</strong><small>Find and protect your best deep-work windows</small></label><label><input aria-label="Plan more realistically" type="radio" name="goal"/><span>↗</span><strong>Plan more realistically</strong><small>Match daily workload to your actual capacity</small></label><label><input aria-label="Build healthier routines" type="radio" name="goal"/><span>☼</span><strong>Build healthier routines</strong><small>Understand how habits affect your work</small></label></div></>}{step===2&&<><h2>Set your typical<br />working day.</h2><p>This helps us understand your calendar availability.</p><div className="field-row"><label>START TIME<input type="time" defaultValue="09:00" /></label><label>END TIME<input type="time" defaultValue="17:00" /></label></div><label className="full-field">WORKING DAYS<select defaultValue="weekdays"><option value="weekdays">Monday to Friday</option><option>Every day</option></select></label></>}{step===3&&<><h2>You’re in control<br />of every signal.</h2><p>Your check-ins, outcomes and priorities are now saved to your private account.</p><div className="consent-list"><label><input aria-label="Daily check-ins" type="checkbox" defaultChecked/><span><strong>Daily check-ins</strong><small>Sleep, energy, stress, goals and outcomes</small></span></label><label><input aria-label="Calendar summaries" type="checkbox"/><span><strong>Calendar summaries</strong><small>Meeting count, duration and free blocks only</small></span></label><label><input aria-label="Personal model training" type="checkbox" defaultChecked/><span><strong>Personal model training</strong><small>Use my data to improve my own forecasts</small></span></label></div></>}<button className="modal-submit" disabled={saving}>{step<3?"Continue":saving?"Saving…":"Start my baseline"}<span>→</span></button></> : <><span className="modal-kicker">{evening ? "EVENING REVIEW" : "MORNING CHECK-IN"} · UNDER 60 SECONDS</span><h2>{evening ? "How did today go?" : "How are you starting today?"}</h2><p>{evening ? "Your reflection becomes a labelled outcome for future personal forecasts." : "Small signals help Daymark understand your capacity."}</p>{evening ? <><label className="range-field"><span><strong>Productivity</strong><b>{productivity} / 10</b></span><input aria-label="Productivity" type="range" min="1" max="10" value={productivity} onChange={e=>setProductivity(Number(e.target.value))} /></label><label className="range-field"><span><strong>Focused work</strong><b>{focus} min</b></span><input aria-label="Focused work" type="range" min="0" max="240" step="15" value={focus} onChange={e=>setFocus(Number(e.target.value))}/></label><label className="full-field">SHORT REFLECTION<textarea value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="What helped or interrupted you today?" /></label></> : <><label className="range-field"><span><strong>Energy</strong><b>{energy} / 5</b></span><input aria-label="Energy" type="range" min="1" max="5" value={energy} onChange={e=>setEnergy(Number(e.target.value))}/></label><label className="range-field"><span><strong>Stress</strong><b>{stress} / 5</b></span><input aria-label="Stress" type="range" min="1" max="5" value={stress} onChange={e=>setStress(Number(e.target.value))}/></label><label className="range-field"><span><strong>Planned focus time</strong><b>{focus} min</b></span><input aria-label="Planned focus time" type="range" min="30" max="240" step="15" value={focus} onChange={e=>setFocus(Number(e.target.value))}/></label><div className="field-row"><label>SLEEP DURATION<input type="text" value={sleep} onChange={(event) => setSleep(event.target.value)} /></label><label>WORKLOAD<select value={workload} onChange={(event) => setWorkload(event.target.value)}><option value="light">Light</option><option value="normal">Normal</option><option value="heavy">Heavy</option></select></label></div></>}<button className="modal-submit" disabled={saving}>{saving ? "Saving…" : `Save ${evening ? "review" : "check-in"}`}<span>→</span></button></>}</form></div>;
}

function Dashboard({ exit, initialOnboarding = false, authenticated = false }: { exit: () => void; initialOnboarding?: boolean; authenticated?: boolean }) {
  const [view, setView] = useState<View>("today");
  const [transitionState, setTransitionState] = useState<"ready" | "leaving" | "entering">("ready");
  const [modal, setModal] = useState<Modal>(initialOnboarding ? "onboarding" : null);
  const [tourOpen, setTourOpen] = useState(false);
  const [data, setData] = useState<DaymarkData>(demoData);
  const [syncMessage, setSyncMessage] = useState("Loading your workspace…");
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titles = useMemo(() => ({ today: "Today", forecast: "Forecast", insights: "Insights", report: "Weekly report", settings: "Settings" }), []);
  useEffect(() => { document.title = `${titles[view]} · Daymark`; }, [view, titles]);
  useEffect(() => () => { if (transitionTimer.current) clearTimeout(transitionTimer.current); }, []);
  useEffect(() => { let active = true; daymarkFetch("/api/daymark").then(async (response) => { const payload = await response.json(); if (!active) return; if (!response.ok) { setSyncMessage(response.status === 401 ? "Demo mode · Sign in to save your personal data" : payload.error ?? "Data sync is unavailable"); return; } setData(payload as DaymarkData); setSyncMessage("Saved privately to your account"); }).catch(() => { if (active) setSyncMessage("Demo mode · Data sync is unavailable"); }); return () => { active = false; }; }, [authenticated]);
  useEffect(() => {
    if (initialOnboarding || localStorage.getItem("daymark-guided-tour:v1")) return;
    const timer = window.setTimeout(() => setTourOpen(true), 650);
    return () => window.clearTimeout(timer);
  }, [initialOnboarding]);

  const changeView = (nextView: View) => {
    if (nextView === view || transitionState !== "ready") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setView(nextView);
      return;
    }

    setTransitionState("leaving");
    transitionTimer.current = window.setTimeout(() => {
      setView(nextView);
      setTransitionState("entering");
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => setTransitionState("ready")));
    }, 150);
  };

  const startTour = () => {
    setView("today");
    setTransitionState("ready");
    window.setTimeout(() => setTourOpen(true), 80);
  };

  const updateData = async (payload: Record<string, unknown>) => { try { setSyncMessage("Saving…"); const next = await daymarkAction(payload); setData(next); setSyncMessage("Saved privately to your account"); return true; } catch (error) { setSyncMessage(error instanceof Error ? error.message : "Your changes could not be saved."); return false; } };
  const saveCheckin = async (payload: CheckinPayload) => { const beginTour = modal === "onboarding"; const saved = await updateData({ action: "checkin.save", ...payload }); if (!saved) return; setModal(null); if (beginTour) window.setTimeout(() => setTourOpen(true), 300); };
  const addPriority = async (title: string) => { await updateData({ action: "priority.create", title, impact: "MEDIUM IMPACT" }); };
  const togglePriority = async (id: number, completed: boolean) => { await updateData({ action: "priority.toggle", id, completed }); };
  const deleteData = async () => { if (!window.confirm("Permanently delete all of your Daymark check-ins, priorities and settings?")) return; const response = await daymarkFetch("/api/daymark", { method: "DELETE" }); if (!response.ok) { const payload = await response.json(); setSyncMessage(payload.error ?? "Your data could not be deleted."); return; } setData({ ...demoData, user: data.user, profile: { ...demoData.profile!, displayName: data.user.displayName, email: data.user.email } }); setSyncMessage("Your Daymark data has been deleted"); };
  const handleExit = async () => { if (authenticated && isSupabaseConfigured) await getSupabaseBrowserClient().auth.signOut(); exit(); };

  return <main className="app-shell"><Sidebar view={view} setView={changeView} exit={handleExit} startTour={startTour} data={data} /><div className="app-main"><div className="sync-banner" role="status"><span className={syncMessage.startsWith("Saved") ? "online" : ""} />{syncMessage}</div><div className={`view-stage ${transitionState}`} aria-live="polite">{view === "today" && <Today setModal={setModal} data={data} onAddPriority={addPriority} onTogglePriority={togglePriority} />}{view === "forecast" && <Forecast setModal={setModal} />}{view === "insights" && <Insights setModal={setModal} />}{view === "report" && <Report setModal={setModal} />}{view === "settings" && <Settings setModal={setModal} data={data} onCalendarToggle={async (connected) => { await updateData({ action: "calendar.toggle", connected }); }} onProfileUpdate={async (displayName, goal) => { await updateData({ action: "profile.update", displayName, goal }); }} onDelete={deleteData} />}</div><footer className="app-footer"><span>Daymark predictions support personal reflection. They are not medical or employment advice.</span><span>Privacy · Help</span></footer></div>{modal && <CheckInModal modal={modal} close={() => setModal(null)} onSaved={saveCheckin} />}{tourOpen && !modal && <GuidedTour onClose={() => setTourOpen(false)} />}</main>;
}

export default function Home() {
  const [experience, setExperience] = useState<"marketing" | "demo" | "onboarding">("marketing");
  const [authOpen, setAuthOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const onboardingAfterSignIn = useRef(false);
  useEffect(() => { document.title = experience === "marketing" ? "Daymark · Personal productivity forecasting" : "Today · Daymark"; }, [experience]);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      setAuthenticated(true);
      setExperience("demo");
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(Boolean(session));
      if (session) {
        setAuthOpen(false);
        setExperience(onboardingAfterSignIn.current ? "onboarding" : "demo");
        onboardingAfterSignIn.current = false;
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const signIn = (onboarding = false) => { onboardingAfterSignIn.current = onboarding; setAuthOpen(true); };
  if (experience === "marketing") return <><Marketing onStart={() => signIn(true)} onDemo={() => setExperience("demo")} onSignIn={() => signIn(false)} />{authOpen ? <AuthDialog onClose={() => setAuthOpen(false)} /> : null}</>;
  return <Dashboard authenticated={authenticated} initialOnboarding={experience === "onboarding"} exit={() => setExperience("marketing")} />;
}
