"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { daymarkFetch, getSupabaseBrowserClient, isSupabaseConfigured } from "./supabase";
import { buildCalendarInsight, buildTrackedDayTrend } from "../lib/trend";
import { buildInsightsSnapshot } from "../lib/insights";
import { buildDailyRecommendation } from "../lib/recommendation";
import { buildPreviewDailyCoachPlan, type DailyCoachContext, type DailyCoachPlan } from "../lib/ai-daily-coach";

type View = "today" | "forecast" | "insights" | "report" | "settings";
type Modal = "morning" | "evening" | "onboarding" | null;
type SettingsSection = "profile" | "model" | "integrations" | "reminders" | "privacy" | "export";
type DaymarkUser = { id: string; email: string; displayName: string };
type UserProfile = { displayName: string; email: string; goal: string; calendarConnected: boolean };
type CheckinRecord = { id: number; entryDate: string; entryType: "morning" | "evening"; energy: number | null; stress: number | null; sleepMinutes: number | null; workload: string | null; plannedFocusMinutes: number | null; productivity: number | null; focusedMinutes: number | null; reflection: string | null; prediction: number | null };
type PriorityRecord = { id: number; title: string; impact: string; completed: boolean };
type PriorityHistoryRecord = { priorityDate: string; completed: boolean };
type CalendarSummary = { summaryDate: string; meetingCount: number; meetingMinutes: number; focusMinutes: number; classMinutes: number; studyMinutes: number; workMinutes: number; personalMinutes: number; longestOpenMinutes: number; longestOpenStartMinute: number | null; longestOpenEndMinute: number | null; firstEventMinute: number | null; lastEventMinute: number | null; syncedAt: string };
type ForecastSignal = { label: string; impact: number; direction: "up" | "down" | "neutral" };
type ForecastModel = { method: string; status: "baseline" | "calibrating" | "personalized"; outcome: string; pairedDays: number; minimumDays: number; backtestDays: number; mae: number | null; confidence: "Baseline only" | "Early" | "Moderate"; rangeLow: number; rangeHigh: number; rangeCoverage: number; signals: ForecastSignal[] };
type DaymarkData = { user: DaymarkUser; profile: UserProfile | null; checkins: CheckinRecord[]; latestMorning: CheckinRecord | null; priorities: PriorityRecord[]; priorityHistory: PriorityHistoryRecord[]; calendarSummaries: CalendarSummary[]; forecast: number; forecastModel: ForecastModel; baselineDays: number };
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
  priorityHistory: [],
  calendarSummaries: [],
  forecast: 74,
  forecastModel: { method: "Personalized ridge regression", status: "baseline", outcome: "HPQ-aligned self-rated work performance (0–10)", pairedDays: 0, minimumDays: 14, backtestDays: 0, mae: null, confidence: "Baseline only", rangeLow: 49, rangeHigh: 99, rangeCoverage: 80, signals: [] },
  baselineDays: 0,
};

async function daymarkAction(payload: Record<string, unknown>) {
  const response = await daymarkFetch("/api/daymark", { method: "POST", body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Your changes could not be saved.");
  return result as DaymarkData;
}

type AuthMode = "signin" | "signup" | "recovery";

function passwordIssue(password: string) {
  if (password.length < 12) return "Use at least 12 characters.";
  if (!/[a-z]/.test(password)) return "Add a lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Add an uppercase letter.";
  if (!/\d/.test(password)) return "Add a number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Add a symbol.";
  return "";
}

function AuthDialog({ onClose, recoveryMode = false, onRecovered }: { onClose: () => void; recoveryMode?: boolean; onRecovered?: () => void }) {
  const [mode, setMode] = useState<AuthMode>(recoveryMode ? "recovery" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [status, setStatus] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [busy, setBusy] = useState<"password" | "email" | "google" | "reset" | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const sendEmailLink = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("email");
    setStatus(null);
    try {
      const { error } = await getSupabaseBrowserClient().auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      setStatus(error ? { message: "We could not send the sign-in link. Please try again.", tone: "error" } : { message: "Check your inbox — your secure sign-in link is on its way.", tone: "success" });
    } catch (error) {
      console.error("Passwordless sign-in failed", error);
      setStatus({ message: "Sign-in is temporarily unavailable.", tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    setStatus(null);

    if (mode !== "signin") {
      const issue = passwordIssue(password);
      if (issue) {
        setStatus({ message: issue, tone: "error" });
        return;
      }
      if (mode === "recovery" && password !== passwordConfirmation) {
        setStatus({ message: "The passwords do not match.", tone: "error" });
        return;
      }
    }

    setBusy("password");
    try {
      const auth = getSupabaseBrowserClient().auth;
      if (mode === "signin") {
        const { error } = await auth.signInWithPassword({ email, password });
        if (error) setStatus({ message: "Email or password is incorrect.", tone: "error" });
      } else if (mode === "signup") {
        const { error } = await auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        setStatus(error
          ? { message: "We could not create the account. Check the details and try again.", tone: "error" }
          : { message: "Check your email to confirm your account, then sign in.", tone: "success" });
      } else {
        const { error } = await auth.updateUser({ password });
        if (error) setStatus({ message: "We could not update the password. Request a new reset link and try again.", tone: "error" });
        else onRecovered?.();
      }
    } catch (error) {
      console.error("Password authentication failed", error);
      setStatus({ message: "Authentication is temporarily unavailable.", tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const resetPassword = async () => {
    if (!email) {
      setStatus({ message: "Enter your email address first.", tone: "error" });
      return;
    }
    setBusy("reset");
    setStatus(null);
    try {
      await getSupabaseBrowserClient().auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      setStatus({ message: "If an account exists for that email, a reset link is on its way.", tone: "success" });
    } catch (error) {
      console.error("Password reset failed", error);
      setStatus({ message: "Password reset is temporarily unavailable.", tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPassword("");
    setPasswordConfirmation("");
    setStatus(null);
  };

  const title = mode === "recovery" ? "Choose a new password." : mode === "signup" ? "Create your Daymark." : "Welcome back.";
  const description = mode === "recovery" ? "Use a strong password you do not use on another service." : "Your check-ins stay inside your private account.";

  return <div className="auth-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="auth-close" onClick={onClose} aria-label="Close sign in">×</button><Logo dark /><span className="auth-kicker">YOUR PRIVATE WORKSPACE</span><h2 id="auth-title">{title}</h2><p>{description}</p>{mode !== "recovery" ? <><div className="auth-mode-tabs" role="tablist" aria-label="Account access"><button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "active" : ""} onClick={() => switchMode("signin")}>Sign in</button><button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => switchMode("signup")}>Create account</button></div><a className="google-auth" href="/api/auth/google"><span aria-hidden="true">G</span>Continue with Google</a><div className="auth-divider"><span>or use email and password</span></div></> : null}<form onSubmit={submitPassword}>{mode !== "recovery" ? <><label htmlFor="auth-email">EMAIL ADDRESS</label><input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></> : null}<label htmlFor="auth-password">{mode === "recovery" ? "NEW PASSWORD" : "PASSWORD"}</label><div className="password-field"><input id="auth-password" type={passwordVisible ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === "signin" ? undefined : 12} required /><button type="button" className="password-toggle" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? "Hide password" : "Show password"}>{passwordVisible ? "Hide" : "Show"}</button></div>{mode !== "signin" ? <p className="password-rules">12+ characters with uppercase, lowercase, a number and a symbol.</p> : null}{mode === "recovery" ? <><label htmlFor="auth-password-confirmation">CONFIRM NEW PASSWORD</label><input id="auth-password-confirmation" type="password" autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} minLength={12} required /></> : null}{mode === "signin" ? <button type="button" className="forgot-password" onClick={() => void resetPassword()} disabled={busy !== null}>{busy === "reset" ? "Sending reset link…" : "Forgot password?"}</button> : null}<button type="submit" disabled={busy !== null}>{busy === "password" ? "Please wait…" : mode === "recovery" ? "Save new password" : mode === "signup" ? "Create account" : "Sign in"}<span className="solid-arrow" aria-hidden="true" /></button></form>{mode === "signin" ? <form className="magic-link-form" onSubmit={sendEmailLink}><button type="submit" className="magic-link-button" disabled={busy !== null}>{busy === "email" ? "Sending link…" : "Email me a passwordless link"}</button></form> : null}{status ? <p className={`auth-status ${status.tone}`} role="status">{status.message}</p> : null}<small>Passwords are handled by Supabase Auth and never stored by Daymark. Your check-ins remain tied to your private account.</small></section></div>;
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
  { target: "outlook", eyebrow: "START HERE", title: "Read today’s outlook.", body: "Your estimate is always paired with a range, readiness level and forward-test error—never presented as a promise or judgement." },
  { target: "factors", eyebrow: "STAY INFORMED", title: "Always see the why.", body: "Positive signals and risk factors explain what moved the outlook, using your own recent patterns." },
  { target: "checkin", eyebrow: "BUILD YOUR BASELINE", title: "A minute makes it personal.", body: "Quick check-ins teach Daymark your energy, stress and sleep rhythm without invasive monitoring." },
  { target: "priorities", eyebrow: "TURN INSIGHT INTO ACTION", title: "Keep the day intentional.", body: "Choose a small set of meaningful priorities, then reflect on what actually happened at day’s end." },
] as const;

const faqs = [
  { category: "Forecasts", question: "What does Daymark’s productivity score mean?", answer: "It is a personal planning estimate from 0 to 100, trained against your HPQ-aligned evening work-performance ratings. It is not a grade, a promise, or a comparison with other people." },
  { category: "Forecasts", question: "How long does it take to build a personal model?", answer: "Daymark requires at least 14 matched morning and evening records before fitting a regularized personal model. Until then it shows a clearly labelled baseline. Confidence remains early until more outcomes and forward-only backtests are available." },
  { category: "Data", question: "What information do I need to share?", answer: "A morning check-in can include sleep duration, energy, stress, planned focus time and workload. Evening reviews add your productivity outcome and an optional reflection. Every input is visible and chosen by you." },
  { category: "Privacy", question: "Can my employer see or use my forecasts?", answer: "No. Daymark is designed as an individual reflection tool, not an employee-ranking system. Your workspace is tied to your account, and forecasts are not presented as medical or employment assessments." },
  { category: "Calendar", question: "Is calendar data used in the model?", answer: "Calendar connection reads your visible selected Google calendars and creates descriptive insights from daily class, study, work and commitment totals plus open focus time. Event text is classified during sync and discarded. Calendar variables do not affect the tested prediction model yet; they need separate forward-only validation before influencing forecasts." },
  { category: "Data", question: "Can I export or permanently delete my information?", answer: "Yes. Data & Settings lets you download your profile, check-ins, priorities, outcomes and calendar summaries as JSON. You can also permanently delete the Daymark records attached to your account." },
  { category: "Accounts", question: "How do I sign in?", answer: "Use email and password, a secure passwordless email link, or continue with Google. New email accounts must be confirmed before access. Daymark uses Supabase Auth to verify your session before private information is loaded or saved." },
  { category: "Forecasts", question: "How is the model tested?", answer: "Daymark uses ridge regression and rolling-origin backtesting: each historical day is predicted only from days that came before it. The app reports mean absolute error and an estimated 80% range when enough paired outcomes exist." },
  { category: "AI planning", question: "How does the AI Daily Coach use my data?", answer: "The coach runs only when you ask it to create a plan. It receives your request plus summarized signals such as today’s check-in, forecast range, first unfinished priority and calendar category totals. Calendar titles, descriptions, people and locations are excluded. Its suggestions never retrain or change Daymark’s tested prediction model." },
] as const;

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`logo ${dark ? "logo-dark" : ""}`}>
      <Image className="logo-mark" src="/daymark-heart.svg" width={34} height={34} alt="" aria-hidden="true" unoptimized />
      <strong>Daymark</strong>
    </span>
  );
}

function GuidedTour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const cardRef = useRef<HTMLElement>(null);
  const [highlight, setHighlight] = useState({ top: 20, left: 20, width: 120, height: 80 });
  const [cardPosition, setCardPosition] = useState({ top: 120, left: 120, width: 340 });
  const [positioned, setPositioned] = useState(false);
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
    setPositioned(true);
  }, [current.target]);

  useEffect(() => {
    const element = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    const startedAt = performance.now();
    let animationFrame = 0;
    const trackTarget = () => {
      updatePosition();
      if (performance.now() - startedAt < (reducedMotion ? 40 : 560)) animationFrame = window.requestAnimationFrame(trackTarget);
    };
    animationFrame = window.requestAnimationFrame(trackTarget);
    const focusTimer = window.setTimeout(() => cardRef.current?.focus(), reducedMotion ? 0 : 90);
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") finish(); };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(focusTimer);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [current.target, finish, updatePosition]);

  return <div className="tour-layer"><div className="tour-catcher" /><div className={`tour-highlight ${positioned ? "positioned" : ""}`} style={highlight} /><section ref={cardRef} tabIndex={-1} className="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" style={cardPosition}><div key={current.target} className="tour-card-content"><div className="tour-topline"><span>{current.eyebrow}</span><button onClick={finish} aria-label="Close guided tour">×</button></div><h2 id="tour-title">{current.title}</h2><p>{current.body}</p><div className="tour-progress" aria-label={`Step ${step + 1} of ${tourSteps.length}`}>{tourSteps.map((item, index) => <i key={item.target} className={index === step ? "active" : index < step ? "complete" : ""} />)}</div><div className="tour-actions"><button className="tour-skip" onClick={finish}>Skip tour</button><div>{step > 0 && <button className="tour-back" onClick={() => setStep(step - 1)}>Back</button>}<button className="tour-next" onClick={() => step === tourSteps.length - 1 ? finish() : setStep(step + 1)}>{step === tourSteps.length - 1 ? "Finish" : "Next"}<span className="solid-arrow" aria-hidden="true" /></button></div></div></div></section></div>;
}

function FaqSection() {
  const [query, setQuery] = useState("");
  const [openQuestion, setOpenQuestion] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleFaqs = normalizedQuery ? faqs.filter((faq) => `${faq.category} ${faq.question} ${faq.answer}`.toLowerCase().includes(normalizedQuery)) : faqs;

  return <section className="faq-section" id="faq"><div className="faq-heading"><div><span className="section-number">04 / COMMON QUESTIONS · {visibleFaqs.length} ANSWERS</span><h2>Clear answers, <em>before you begin.</em></h2></div><label className="faq-search"><span aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search questions" aria-label="Search frequently asked questions" />{query ? <button onClick={() => setQuery("")} aria-label="Clear FAQ search">×</button> : null}</label></div><div className="faq-list">{visibleFaqs.length ? visibleFaqs.map((faq, index) => { const open = openQuestion === faq.question; const answerId = `faq-answer-${index}`; return <article className={open ? "open" : ""} key={faq.question}><button aria-expanded={open} aria-controls={answerId} onClick={() => setOpenQuestion(open ? "" : faq.question)}><span><small>{faq.category}</small>{faq.question}</span><i aria-hidden="true" /></button><div className="faq-answer" id={answerId} hidden={!open}><p>{faq.answer}</p></div></article>; }) : <div className="faq-empty"><strong>No matching questions.</strong><p>Try searching for “privacy”, “score”, “calendar” or “data”.</p><button onClick={() => setQuery("")}>Show every answer</button></div>}</div></section>;
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
            Daymark learns from your morning signals and anchored evening outcomes, then tests each personal forecast against future-held-out days.
          </p>
          <div className="hero-actions">
            <button className="primary-cta" onClick={onStart}>Build my evidence <span className="solid-arrow" aria-hidden="true" /></button>
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
                <p className="mini-kicker">EXAMPLE PERSONAL OUTLOOK</p>
                <h2>A strong day for<br />deep work.</h2>
                <div className="score-row">
                  <div className="score-ring" style={{ "--score": 74 } as React.CSSProperties}>
                    <div><strong>74</strong><span>/100</span></div>
                  </div>
                  <div className="range-copy"><span className="confidence-dot" /> Early confidence<strong>Estimated 80% range 62–86</strong><small>Illustrative · requires matched outcomes</small></div>
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
        <div><i aria-hidden="true">↗</i><strong>Understand</strong><span>See what shaped the estimate</span></div>
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
          <article><span>02 · MODEL</span><div className="step-symbol">▦</div><h3>Learn only from your outcomes.</h3><p>After 14 matched days, regularized regression estimates personal relationships without borrowing another person’s performance.</p><div className="step-preview signal-preview"><span><i className="positive-bg" />Rolling backtest <b>MAE</b></span><span><i className="negative-bg" />Uncertainty <b>80% range</b></span></div></article>
          <article><span>03 · ACT</span><div className="step-symbol">✦</div><h3>Leave with one clear move.</h3><p>No overwhelming advice feed—just the most useful adjustment for the day.</p><div className="step-preview action-preview"><small>BEST NEXT MOVE</small><strong>Protect 9–11am for your hardest priority.</strong></div></article>
        </div>
      </section>

      <section className="science-section" id="science">
        <div>
          <span className="section-number light">02 / DESIGNED AROUND YOU</span>
          <h2>Your rhythm is<br />the real benchmark.</h2>
        </div>
        <div className="science-copy">
          <p>Daymark compares each day to <strong>your own patterns</strong>—not someone else’s output. Before 14 matched outcomes it shows only an observed baseline; personal forecasts begin after that threshold and are backtested in time order.</p>
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
    <header className="app-header"><div><p>{subtitle}</p><h1>{title}</h1></div><div className="header-actions"><button className="outline-button" onClick={() => setModal("morning")}>☼ Morning check-in</button><button className="dark-button" onClick={() => setModal("evening")}>Evening review <span>→</span></button></div></header>
  );
}

function formatMinutes(minutes: number | null) {
  if (minutes == null) return "–";
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
  return `${minutes}m`;
}

function formatClock(minutes: number | null) {
  if (minutes == null) return null;
  const safe = Math.max(0, Math.min(1440, minutes));
  const hour = Math.floor(safe / 60) % 24;
  const minute = safe % 60;
  return new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 1, hour, minute)));
}

function AiDailyCoach({ data, authenticated, todayKey }: { data: DaymarkData; authenticated: boolean; todayKey: string }) {
  const [request, setRequest] = useState("");
  const [plan, setPlan] = useState<DailyCoachPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const morning = data.latestMorning;
  const calendar = data.calendarSummaries.find((summary) => summary.summaryDate === todayKey) ?? null;
  const priority = data.priorities.find((item) => !item.completed)?.title ?? null;
  const presets = ["Protect deep work", "Balance classes and study", "Recover without losing momentum"];

  const previewContext = (): DailyCoachContext => ({
    localDate: todayKey,
    request,
    goal: data.profile?.goal ?? "Improve daily focus",
    forecast: data.forecast,
    rangeLow: data.forecastModel.rangeLow,
    rangeHigh: data.forecastModel.rangeHigh,
    modelStatus: data.forecastModel.status,
    energy: morning?.energy ?? null,
    stress: morning?.stress ?? null,
    sleepMinutes: morning?.sleepMinutes ?? null,
    plannedFocusMinutes: morning?.plannedFocusMinutes ?? null,
    workload: morning?.workload ?? null,
    priority,
    calendar: calendar ? {
      classMinutes: calendar.classMinutes,
      studyMinutes: calendar.studyMinutes,
      workMinutes: calendar.workMinutes,
      scheduledMinutes: calendar.meetingMinutes,
      openMinutes: calendar.focusMinutes,
      longestOpenMinutes: calendar.longestOpenMinutes,
      longestOpenStartMinute: calendar.longestOpenStartMinute,
      longestOpenEndMinute: calendar.longestOpenEndMinute,
    } : null,
  });

  const createPlan = async (event: FormEvent) => {
    event.preventDefault();
    const cleanRequest = request.trim();
    if (cleanRequest.length < 3 || loading) return;
    setError("");
    setLoading(true);
    try {
      if (!authenticated) {
        setPlan(buildPreviewDailyCoachPlan({ ...previewContext(), request: cleanRequest }));
        return;
      }
      const response = await daymarkFetch("/api/ai/daily-plan", { method: "POST", body: JSON.stringify({ request: cleanRequest, localDate: todayKey }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "The AI coach could not create a plan.");
      setPlan(payload as DailyCoachPlan);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The AI coach could not create a plan.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="ai-coach-card" data-tour="ai-coach">
      <div className="card-label"><span>✦ AI DAILY COACH</span><b>{authenticated ? "PRIVATE · ON REQUEST" : "DEMO PREVIEW"}</b></div>
      <div className="ai-coach-layout">
        <div className="ai-coach-copy">
          <span className="ai-coach-kicker">CUSTOMIZE TODAY</span>
          <h2>Tell Daymark what you need<br /><em>to adjust or achieve.</em></h2>
          <p>The coach combines your request with today’s capacity, check-in, priority and calendar totals. It suggests a plan—it never changes your tested forecast.</p>
          <div className="ai-context-pills"><span>{data.forecast}/100 outlook</span><span>{morning?.energy ? `Energy ${morning.energy}/5` : "No energy check-in"}</span><span>{calendar ? `${formatMinutes(calendar.focusMinutes)} open` : "No calendar summary"}</span></div>
        </div>
        <form className="ai-coach-form" onSubmit={createPlan}>
          <label htmlFor="ai-coach-request">WHAT WOULD IMPROVE TODAY?</label>
          <textarea id="ai-coach-request" value={request} onChange={(event) => setRequest(event.target.value)} maxLength={500} placeholder="For example: I have two classes today and need to prepare for an assignment without exhausting myself." />
          <div className="ai-coach-presets">{presets.map((preset) => <button type="button" key={preset} onClick={() => setRequest(preset)}>{preset}</button>)}</div>
          <button className="dark-button ai-coach-submit" type="submit" disabled={loading || request.trim().length < 3}>{loading ? "Creating your plan…" : "Create my plan"}<span>→</span></button>
          {!authenticated && <small>Demo creates a local preview. Sign in for an AI-generated plan based on your private records.</small>}
          {error && <p className="ai-coach-error" role="alert">{error}</p>}
        </form>
      </div>
      {plan && <div className="ai-plan" aria-live="polite">
        <div className="ai-plan-heading"><span>{plan.source === "ai" ? "AI-GENERATED PLAN" : "DEMO PLAN PREVIEW"}</span><h3>{plan.headline}</h3><p>{plan.summary}</p></div>
        <div className="ai-plan-actions">{plan.actions.map((action, index) => <article key={`${action.title}-${index}`}><b>0{index + 1}</b><div><span>{action.effort} · {action.durationMinutes} min</span><h4>{action.title}</h4><strong>{action.timing}</strong><p>{action.reason}</p></div></article>)}</div>
        <div className="ai-plan-adjustment"><span>↗</span><p><small>ADJUSTMENT</small><strong>{plan.adjustment}</strong></p></div>
        <p className="ai-plan-evidence">{plan.evidenceNote}</p>
      </div>}
      <p className="ai-coach-privacy">Only summarized Daymark signals and the text you enter are sent for generation. Calendar titles, descriptions and locations are excluded.</p>
    </section>
  );
}

function Today({ setModal, data, authenticated, onAddPriority, onTogglePriority, onCalendarConnect, onOpenInsights }: { setModal: (modal: Modal) => void; data: DaymarkData; authenticated: boolean; onAddPriority: (title: string) => Promise<boolean>; onTogglePriority: (id: number, completed: boolean) => Promise<void>; onCalendarConnect: () => Promise<void>; onOpenInsights: () => void }) {
  const [addingPriority, setAddingPriority] = useState(false);
  const [priorityTitle, setPriorityTitle] = useState("");
  const [prioritySaving, setPrioritySaving] = useState(false);
  const [calendarDay, setCalendarDay] = useState<"today" | "tomorrow">("today");
  const [featureJumpTarget, setFeatureJumpTarget] = useState<"calendar" | "priorities" | null>(null);
  const calendarCardRef = useRef<HTMLElement>(null);
  const prioritiesCardRef = useRef<HTMLElement>(null);
  const priorityInputRef = useRef<HTMLInputElement>(null);
  const morning = data.latestMorning;
  const model = data.forecastModel;
  const completed = data.priorities.filter((priority) => priority.completed).length;
  const now = new Date();
  const dayLabel = new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long" }).format(now).toUpperCase();
  const firstName = data.user.displayName.split(/\s+/)[0] || "there";
  const sleepHours = morning?.sleepMinutes ? `${Math.floor(morning.sleepMinutes / 60)}h ${morning.sleepMinutes % 60}m` : "Not recorded";
  const trackedTrend = useMemo(() => buildTrackedDayTrend(data.checkins), [data.checkins]);
  const calendarInsight = useMemo(() => buildCalendarInsight(data.calendarSummaries, data.checkins), [data.calendarSummaries, data.checkins]);
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  const selectedCalendar = data.calendarSummaries.find((summary) => summary.summaryDate === (calendarDay === "today" ? todayKey : tomorrowKey));
  const connected = Boolean(data.profile?.calendarConnected);
  const activePriority = data.priorities.find((priority) => !priority.completed) ?? null;
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const dailyRecommendation = useMemo(() => buildDailyRecommendation({
    forecast: data.forecast,
    modelStatus: model.status,
    plannedFocusMinutes: morning?.plannedFocusMinutes ?? null,
    priorityTitle: activePriority?.title ?? null,
    calendar: data.calendarSummaries.find((summary) => summary.summaryDate === todayKey) ?? null,
    currentMinute,
  }), [activePriority?.title, currentMinute, data.calendarSummaries, data.forecast, model.status, morning?.plannedFocusMinutes, todayKey]);
  const suggestedStudyMinutes = selectedCalendar?.classMinutes ? Math.max(0, selectedCalendar.classMinutes - selectedCalendar.studyMinutes) : 0;
  const calendarSpan = selectedCalendar?.firstEventMinute == null ? null : `${formatClock(selectedCalendar.firstEventMinute)}–${formatClock(selectedCalendar.lastEventMinute)}`;
  const calendarGuidance = !selectedCalendar
    ? `No timed commitments found for ${calendarDay}. You have a largely open working day.`
    : selectedCalendar.classMinutes > 0
      ? `${formatMinutes(selectedCalendar.classMinutes)} of classes are scheduled. ${suggestedStudyMinutes ? `Allow about ${formatMinutes(suggestedStudyMinutes)} more for independent study.` : "Your calendar already includes matching study time."}`
      : selectedCalendar.workMinutes > 0
        ? `${formatMinutes(selectedCalendar.workMinutes)} of work is scheduled, with a longest open block of ${formatMinutes(selectedCalendar.longestOpenMinutes)}.`
        : selectedCalendar.meetingMinutes > 240
          ? `This is a commitment-heavy day. Keep demanding work inside the ${formatMinutes(selectedCalendar.longestOpenMinutes)} longest open block.`
          : `You have ${formatMinutes(selectedCalendar.focusMinutes)} open in your working day; the longest uninterrupted block is ${formatMinutes(selectedCalendar.longestOpenMinutes)}.`;
  useEffect(() => {
    if (!featureJumpTarget) return;
    const frame = window.requestAnimationFrame(() => {
      const target = featureJumpTarget === "calendar" ? calendarCardRef.current : prioritiesCardRef.current;
      target?.scrollIntoView({ behavior: "instant", block: "center" });
      if (featureJumpTarget === "priorities") priorityInputRef.current?.focus({ preventScroll: true });
      else target?.focus({ preventScroll: true });
    });
    const clearHighlight = window.setTimeout(() => setFeatureJumpTarget(null), 1100);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(clearHighlight); };
  }, [featureJumpTarget]);
  const openRecommendedFeature = () => {
    if (!dailyRecommendation.hasPriority) {
      setAddingPriority(true);
      setFeatureJumpTarget("priorities");
      return;
    }
    setCalendarDay("today");
    setFeatureJumpTarget("calendar");
  };
  const submitPriority = async (event: FormEvent) => { event.preventDefault(); const title = priorityTitle.trim(); if (!title || prioritySaving) return; setPrioritySaving(true); try { const saved = await onAddPriority(title); if (!saved) return; setPriorityTitle(""); setAddingPriority(false); } finally { setPrioritySaving(false); } };
  return (
    <>
      <AppHeader title={`Good morning, ${firstName}.`} subtitle={dayLabel} setModal={setModal} />
      <div className="dashboard-grid">
        <section className="outlook-card" data-tour="outlook">
          <div className="card-label"><span>✦</span> TODAY’S PERSONAL CAPACITY OUTLOOK <button aria-label="More options">•••</button></div>
          <div className="outlook-main">
            <div><span className="outlook-date">{dayLabel}</span><h2>{model.status === "personalized" ? <>Your personal model<br /><em>is active.</em></> : <>Building an honest<br /><em>baseline.</em></>}</h2><p>{model.status === "personalized" ? "This estimate is fitted to your own matched check-ins and outcomes." : `Record ${Math.max(0, model.minimumDays - model.pairedDays)} more matched morning and evening reviews before personal modelling begins.`}</p></div>
            <div className="large-score-ring" style={{ "--score": data.forecast } as React.CSSProperties}><div><strong>{data.forecast}</strong><span>/100</span><small>{model.status === "personalized" ? "MODEL" : "BASELINE"}</small></div></div>
          </div>
          <div className="confidence-line"><span><i /> {model.confidence} confidence</span><strong>Estimated {model.rangeCoverage}% range {model.rangeLow}–{model.rangeHigh}</strong><small>{model.pairedDays} matched outcomes{model.mae == null ? "" : ` · backtest MAE ${model.mae}`}</small></div>
          <div className="recommendation wide"><span>✦</span><div><small>YOUR BEST NEXT MOVE · {dailyRecommendation.timeLabel}</small><strong>{dailyRecommendation.title}</strong><p>{dailyRecommendation.rationale}</p></div><button onClick={openRecommendedFeature}>{dailyRecommendation.hasPriority ? "View calendar" : "Add priority"} <span>→</span></button></div>
        </section>

        <section className="checkin-card" data-tour="checkin">
          <div className="card-label">TODAY’S CHECK-IN {morning ? <span className="complete-pill">✓ SAVED</span> : <span>NOT STARTED</span>}</div>
          <div className="wellbeing-row"><div><span>☼</span><small>ENERGY</small><strong>{morning?.energy ?? "–"} / 5</strong></div><div><span>◌</span><small>FOCUS PLAN</small><strong>{morning?.plannedFocusMinutes ?? "–"} min</strong></div><div><span>⌁</span><small>STRESS</small><strong>{morning?.stress ?? "–"} / 5</strong></div></div>
          <div className="sleep-line"><span>☾</span><div><small>LAST NIGHT’S SLEEP</small><strong>{sleepHours} {morning && <em>{(morning.sleepMinutes ?? 0) >= 420 ? "Good" : "Low"}</em>}</strong></div></div>
          <button className="text-action" onClick={() => setModal("morning")}>{morning ? "Edit" : "Start"} check-in <span>→</span></button>
        </section>

        <AiDailyCoach data={data} authenticated={authenticated} todayKey={todayKey} />

        <section className="factors-card" data-tour="factors">
          <div className="card-label">MODEL CONTRIBUTIONS <button>Ridge regression ↗</button></div>
          {model.signals.length ? <div className="factor-list">{model.signals.map((factor) => <div className="factor" key={factor.label}><span className={factor.direction === "up" ? "factor-up" : "factor-down"}>{factor.direction === "up" ? "↑" : factor.direction === "down" ? "↓" : "·"}</span><div><strong>{factor.label}</strong><small>Compared with your own training average</small></div><b className={factor.impact >= 0 ? "positive" : "negative"}>{factor.impact > 0 ? "+" : ""}{factor.impact}</b></div>)}</div> : <p className="empty-state">Contributions appear after {model.minimumDays} matched morning and evening records. No generic signal weights are used.</p>}
        </section>

        <section ref={calendarCardRef} tabIndex={-1} className={`calendar-card${featureJumpTarget === "calendar" ? " feature-jump-target" : ""}`}>
          <div className="card-label"><span>{calendarDay === "today" ? "TODAY’S" : "TOMORROW’S"} CALENDAR</span><div className="calendar-card-actions"><div className="calendar-day-switch" aria-label="Calendar day"><button className={calendarDay === "today" ? "selected" : ""} onClick={() => setCalendarDay("today")}>TODAY</button><button className={calendarDay === "tomorrow" ? "selected" : ""} onClick={() => setCalendarDay("tomorrow")}>TOMORROW</button></div><button onClick={() => void onCalendarConnect()}>{connected ? "Sync again ↗" : "Connect Google ↗"}</button></div></div>
          {connected ? <><div className="calendar-stats calendar-stats-rich"><div><strong>{formatMinutes(selectedCalendar?.classMinutes ?? 0)}</strong><span>Classes</span></div><div><strong>{formatMinutes(selectedCalendar?.studyMinutes ?? 0)}</strong><span>Study booked</span></div><div><strong>{formatMinutes(selectedCalendar?.workMinutes ?? 0)}</strong><span>Work booked</span></div><div><strong>{formatMinutes(selectedCalendar?.focusMinutes ?? 480)}</strong><span>Open work time</span></div></div><div className="calendar-category-row"><span>{selectedCalendar?.meetingCount ?? 0} timed event{selectedCalendar?.meetingCount === 1 ? "" : "s"}</span><span>{formatMinutes(selectedCalendar?.meetingMinutes ?? 0)} scheduled</span>{calendarSpan && <span>{calendarSpan}</span>}</div><div className="calendar-insight calendar-insight-primary"><span>✦</span><p><small>PLAN THE DAY</small><strong>{calendarGuidance}</strong></p></div><p className="calendar-evidence">{calendarInsight.text}</p></> : <div className="calendar-connect"><span className="calendar-logo">31</span><div><strong>Connect Google Calendar</strong><p>See class, study and work totals from every visible selected calendar, plus open focus time. Event names and people are never stored.</p></div><button className="dark-button" onClick={() => void onCalendarConnect()}>Connect</button></div>}
        </section>

        <section ref={prioritiesCardRef} tabIndex={-1} className={`priorities-card${featureJumpTarget === "priorities" ? " feature-jump-target" : ""}`} data-tour="priorities">
          <div className="card-label">TODAY’S PRIORITIES <span>{completed} OF {data.priorities.length} COMPLETE</span></div>
          {data.priorities.length === 0 && <p className="empty-state">Choose one meaningful outcome for today.</p>}
          {data.priorities.map((priority) => <label key={priority.id}><input type="checkbox" checked={priority.completed} onChange={(event) => void onTogglePriority(priority.id, event.target.checked)} /><span>{priority.title}</span><small>{priority.impact}</small></label>)}
          {addingPriority ? <form className="priority-form" onSubmit={submitPriority}><input ref={priorityInputRef} aria-label="New priority" placeholder="What matters most today?" value={priorityTitle} onChange={(event) => setPriorityTitle(event.target.value)} maxLength={180} disabled={prioritySaving} /><button type="submit" disabled={prioritySaving}>{prioritySaving ? "Adding…" : "Add"}</button><button type="button" disabled={prioritySaving} onClick={() => setAddingPriority(false)}>Cancel</button></form> : <button className="text-action" onClick={() => setAddingPriority(true)}>+ Add priority</button>}
        </section>

        <section className="trend-card">
          <div className="card-label">LAST 7 TRACKED DAYS <button onClick={onOpenInsights}>View insights →</button></div>
          <div className="trend-summary"><div><strong>{trackedTrend.average ?? "–"}</strong><span>{trackedTrend.outcomeCount ? `Average across ${trackedTrend.outcomeCount} outcome${trackedTrend.outcomeCount === 1 ? "" : "s"}` : "No scored outcomes yet"}</span></div><em className={trackedTrend.delta != null && trackedTrend.delta < 0 ? "down" : ""}>{trackedTrend.comparison}</em></div>
          {trackedTrend.points.length ? <div className="mini-bars">{trackedTrend.points.map((point) => <div key={point.date} title={`${point.date}: ${point.score == null ? "check-in only" : `${point.score}/100`}`}><span style={{ height: `${point.score == null ? 8 : Math.max(8, point.score)}%` }} className={`${point.date === trackedTrend.peakDate ? "peak" : ""} ${point.score == null ? "pending" : ""}`} /><small>{new Intl.DateTimeFormat("en-AU", { weekday: "narrow" }).format(new Date(`${point.date}T12:00:00`))}</small></div>)}</div> : <p className="empty-state">Your tracked days will appear here, even when there are gaps between check-ins.</p>}
        </section>
      </div>
    </>
  );
}

function Forecast({ setModal, data }: { setModal: (modal: Modal) => void; data: DaymarkData }) {
  const model = data.forecastModel;
  const progress = Math.min(100, model.pairedDays / model.minimumDays * 100);
  return <><AppHeader title="Your model, with evidence." subtitle="PERSONAL FORECAST VALIDATION" setModal={setModal} /><section className="page-card forecast-hero"><div><span className="section-number">CURRENT METHOD</span><h2>Simple enough to explain.<br /><em>Tested in time order.</em></h2><p>Daymark uses regularized linear regression on your own mornings and HPQ-aligned evening ratings. It never trains on another person’s performance.</p></div><div className="forecast-average"><small>CURRENT OUTLOOK</small><strong>{data.forecast}</strong><span>/100 · {model.status === "personalized" ? "PERSONAL" : "BASELINE"}</span></div></section><div className="two-column"><section className="page-card"><div className="card-label">HOW IT IS TESTED</div><div className="risk-item positive-risk"><span>1</span><div><strong>Matched daily outcomes</strong><p>A morning’s sleep, energy, stress, focus plan and workload are paired with that evening’s 0–10 work-performance rating.</p></div></div><div className="risk-item positive-risk"><span>2</span><div><strong>Rolling-origin backtest</strong><p>Each test day is predicted only from earlier days, preventing future information from leaking into the accuracy result.</p></div></div><div className="risk-item positive-risk"><span>3</span><div><strong>Regularized coefficients</strong><p>Ridge shrinkage reduces unstable weights when personal datasets are still small or inputs overlap.</p></div></div></section><section className="page-card"><div className="card-label">MODEL READINESS</div><h3 className="confidence-title">{model.confidence}</h3><div className="confidence-meter"><i style={{ width: `${progress}%` }} /></div><p>{model.status === "personalized" ? `Tested across ${model.backtestDays} forward-held-out days${model.mae == null ? "." : ` with a mean absolute error of ${model.mae} points.`}` : `${Math.max(0, model.minimumDays - model.pairedDays)} more matched outcomes are needed before fitting the personal model.`}</p><span className="info-pill">{model.pairedDays} / {model.minimumDays} MATCHED DAYS</span></section></div><section className="page-card chart-card"><div className="card-label">INTERPRETATION LIMITS <span>PERSONAL PLANNING ONLY</span></div><p className="story-copy">The outcome scale is aligned with the WHO Health and Work Performance Questionnaire, but Daymark’s daily adaptation and personal predictor are not a medical test or an employment assessment. The range is an empirical estimate, not a guarantee.</p></section></>;
}

function Insights({ setModal, data }: { setModal: (modal: Modal) => void; data: DaymarkData }) {
  const [range, setRange] = useState<7 | 30 | 90>(7);
  const now = new Date();
  const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const snapshot = useMemo(() => buildInsightsSnapshot(data.checkins, data.priorityHistory, data.calendarSummaries, range, endDate), [data.checkins, data.priorityHistory, data.calendarSummaries, range, endDate]);
  const compactDate = (date: string) => new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  const tickDates = [snapshot.dates[0], snapshot.dates[Math.floor((snapshot.dates.length - 1) / 2)], snapshot.dates.at(-1)!];
  return <><AppHeader title="Patterns you can understand." subtitle={`INSIGHTS · PAST ${range} CALENDAR DAYS`} setModal={setModal} /><section className="insight-overview"><div><span>{snapshot.readiness.toUpperCase()}</span><h2>{snapshot.summary}</h2><p>{snapshot.trackedDays} of {range} days contain a check-in · {snapshot.outcomeCount} evening outcome{snapshot.outcomeCount === 1 ? "" : "s"}. Scores come only from your own 0–10 evening reviews.</p></div>{snapshot.bestWeekday ? <aside><small>BEST SCORING WEEKDAY</small><strong>{snapshot.bestWeekday.day}</strong><span>{snapshot.bestWeekday.score}/100 average</span></aside> : <aside className="muted"><small>NEXT MILESTONE</small><strong>3</strong><span>evening outcomes to compare</span></aside>}</section><div className="insight-stats"><article><span>AVERAGE OUTCOME</span><strong>{snapshot.averageScore ?? "–"}</strong><em>{snapshot.scoreDelta == null ? `${snapshot.outcomeCount} scored day${snapshot.outcomeCount === 1 ? "" : "s"}` : `${snapshot.scoreDelta >= 0 ? "+" : ""}${snapshot.scoreDelta} pts vs prior period`}</em></article><article><span>TRACKING COVERAGE</span><strong>{Math.round(snapshot.trackedDays / range * 100)}%</strong><em>{snapshot.trackedDays} of {range} calendar days</em></article><article><span>FOCUSED WORK</span><strong>{formatMinutes(snapshot.focusAverage)}</strong><em>{snapshot.focusAverage == null ? "Add evening focus time" : "Average on reviewed days"}</em></article><article><span>PRIORITY COMPLETION</span><strong>{snapshot.priorityCompletion == null ? "–" : `${snapshot.priorityCompletion}%`}</strong><em>{snapshot.priorityCount ? `${snapshot.priorityCount} priorities in this period` : "No priorities recorded in period"}</em></article></div><div className="two-column insight-columns"><section className="page-card"><div className="card-label">YOUR COMPARISONS <span>ASSOCIATION, NOT CAUSATION</span></div>{snapshot.signals.length ? <div className="correlation-list">{snapshot.signals.map((item) => <div key={item.label}><div className="correlation-copy"><span><strong>{item.label}</strong><small>{item.note}</small></span><b className={item.change >= 0 ? "positive" : "negative"}>{item.change >= 0 ? "+" : ""}{item.change} pts</b></div><div className="correlation-bar"><i className={item.change >= 0 ? "positive-bg" : "negative-bg"} style={{ width: `${item.strength}%` }} /></div></div>)}</div> : <div className="insight-empty"><strong>No defensible comparison yet.</strong><p>Each comparison needs at least two scored days on both sides—for example, two 7+ hour sleep days and two shorter-sleep days.</p><span>{snapshot.outcomeCount} scored days available</span></div>}</section><section className="page-card experiment-card"><span className="section-number">SUGGESTED PERSONAL TEST</span><div className="experiment-symbol">✦</div><h3>{snapshot.experiment.title}</h3><p>{snapshot.experiment.body}</p><small>Keep other routines as steady as practical. Treat the result as a personal association, not proof of cause.</small></section></div><section className="page-card chart-card"><div className="card-label"><span>EVENING OUTCOMES OVER TIME</span><div><button className={range === 7 ? "selected" : ""} onClick={() => setRange(7)}>7 DAYS</button><button className={range === 30 ? "selected" : ""} onClick={() => setRange(30)}>30 DAYS</button><button className={range === 90 ? "selected" : ""} onClick={() => setRange(90)}>90 DAYS</button></div></div><div className={`line-chart range-${range}`}><div className="chart-y"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div><div className="chart-area">{snapshot.averageScore != null && <div className="average-line" style={{ top: `${100 - snapshot.averageScore}%` }}><span>Period average · {snapshot.averageScore}</span></div>}<div className="chart-bars">{snapshot.series.map((point) => <i key={point.date} className={point.score == null ? point.tracked ? "tracked-no-score" : "missing" : ""} style={{ height: point.score == null ? "7px" : `${Math.max(7, point.score)}%` }} title={`${compactDate(point.date)}: ${point.score == null ? point.tracked ? "tracked, no evening score" : "not tracked" : `${point.score}/100`}`} aria-label={`${compactDate(point.date)}: ${point.score == null ? point.tracked ? "tracked without an evening score" : "not tracked" : `${point.score} out of 100`}`} />)}</div><div className="chart-x">{tickDates.map((date) => <span key={date}>{compactDate(date)}</span>)}</div></div></div><div className="chart-legend"><span><i /> Evening outcome</span><span><i className="tracked" /> Check-in without evening score</span><span><i className="missing" /> Not tracked</span><p>Hover a bar for the date and score. Missing days stay visible so the trend does not imply continuous tracking.</p></div></section></>;
}

function Report({ setModal }: { setModal: (modal: Modal) => void }) {
  return <><AppHeader title="A week in perspective." subtitle="WEEKLY REPORT · 5–11 AUGUST" setModal={setModal} /><section className="report-cover"><span>WEEK 32</span><div><p>YOUR WEEKLY SUMMARY</p><h2>You made space for<br /><em>what mattered.</em></h2><small>Three strong focus days · 82% of priorities completed</small></div><div className="report-score"><strong>76</strong><span>WEEKLY SCORE</span><em>↗ 6 points</em></div></section><div className="report-metrics"><article><span>PRIORITIES</span><strong>14 / 17</strong><div><i style={{width:"82%"}} /></div><small>82% complete</small></article><article><span>FOCUS TIME</span><strong>11h 34m</strong><div><i style={{width:"72%"}} /></div><small>1h 39m daily average</small></article><article><span>MEETING TIME</span><strong>8h 15m</strong><div><i className="orange" style={{width:"48%"}} /></div><small>12 meetings total</small></article></div><div className="two-column"><section className="page-card"><div className="card-label">THIS WEEK’S STORY</div><h3 className="story-title">Your best work happened before noon.</h3><p className="story-copy">Four of your five highest-scoring focus sessions started before 10am. Days with a protected morning block averaged <strong>12 points higher</strong> than days without one.</p><div className="story-callout"><span>✦</span><p><small>TRY THIS NEXT WEEK</small><strong>Reserve Monday, Wednesday and Thursday mornings for priority work.</strong></p></div></section><section className="page-card"><div className="card-label">DAILY SCORES</div><div className="report-days">{week.slice(0,7).map(d=><div key={d.day}><span style={{height:`${d.score}%`}} className={d.score > 78 ? "high" : ""}><b>{d.score}</b></span><small>{d.day}</small></div>)}</div></section></div><button className="download-report" onClick={() => window.print()}>↓ Download weekly report</button></>;
}

function Settings({ setModal, data, onCalendarConnect, onCalendarDisconnect, onProfileUpdate, onDelete }: { setModal: (modal: Modal) => void; data: DaymarkData; onCalendarConnect: () => Promise<void>; onCalendarDisconnect: () => Promise<void>; onProfileUpdate: (displayName: string, goal: string) => Promise<void>; onDelete: () => Promise<void> }) {
  const sections: { id: SettingsSection; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "model", label: "Prediction model" },
    { id: "integrations", label: "Integrations" },
    { id: "reminders", label: "Reminders" },
    { id: "privacy", label: "Privacy & consent" },
    { id: "export", label: "Export & deletion" },
  ];
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");
  const [displayName, setDisplayName] = useState(data.profile?.displayName ?? data.user.displayName);
  const [goal, setGoal] = useState(data.profile?.goal ?? "Improve daily focus");
  const [saved, setSaved] = useState(false);
  const [morningReminder, setMorningReminder] = useState(true);
  const [eveningReminder, setEveningReminder] = useState(true);
  const [morningTime, setMorningTime] = useState("08:00");
  const [eveningTime, setEveningTime] = useState("18:00");
  const [remindersSaved, setRemindersSaved] = useState(false);
  const connected = Boolean(data.profile?.calendarConnected);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const preferences = JSON.parse(localStorage.getItem("daymark-reminders:v1") ?? "null");
        if (!preferences) return;
        setMorningReminder(preferences.morningEnabled !== false);
        setEveningReminder(preferences.eveningEnabled !== false);
        if (typeof preferences.morningTime === "string") setMorningTime(preferences.morningTime);
        if (typeof preferences.eveningTime === "string") setEveningTime(preferences.eveningTime);
      } catch { /* Keep safe defaults if a device preference is malformed. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const exportData = () => { const exported = JSON.stringify({ product: "Daymark", exportedAt: new Date().toISOString(), user: data.user, profile: data.profile, checkins: data.checkins, priorities: data.priorities, calendarSummaries: data.calendarSummaries }, null, 2); const url = URL.createObjectURL(new Blob([exported], {type:"application/json"})); const a=document.createElement("a"); a.href=url; a.download="daymark-data.json"; a.click(); URL.revokeObjectURL(url); };
  const saveProfile = async (event: FormEvent) => { event.preventDefault(); await onProfileUpdate(displayName, goal); setSaved(true); window.setTimeout(() => setSaved(false), 1800); };
  const saveReminders = () => {
    localStorage.setItem("daymark-reminders:v1", JSON.stringify({ morningEnabled: morningReminder, eveningEnabled: eveningReminder, morningTime, eveningTime }));
    setRemindersSaved(true);
    window.setTimeout(() => setRemindersSaved(false), 1800);
  };
  const panelId = `settings-panel-${activeSection}`;
  return <><AppHeader title="Your data, your choices." subtitle="DATA & SETTINGS" setModal={setModal} /><div className="settings-layout"><div className="settings-tabs" aria-label="Settings sections" role="tablist" aria-orientation="vertical">{sections.map((section) => <button key={section.id} id={`settings-tab-${section.id}`} role="tab" aria-selected={activeSection === section.id} aria-controls={`settings-panel-${section.id}`} className={activeSection === section.id ? "active" : ""} onClick={() => setActiveSection(section.id)}>{section.label}</button>)}</div><div className="settings-content" id={panelId} role="tabpanel" aria-labelledby={`settings-tab-${activeSection}`}>
    {activeSection === "profile" && <section className="settings-section"><div><h2>Personal workspace</h2><p>Your account and preferences are stored privately and attached to your signed-in identity.</p></div><form className="profile-form" onSubmit={saveProfile}><label>DISPLAY NAME<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} /></label><label>ACCOUNT EMAIL<input value={data.user.email} disabled /></label><label>PRIMARY GOAL<select value={goal} onChange={(event) => setGoal(event.target.value)}><option>Improve daily focus</option><option>Plan more realistically</option><option>Build healthier routines</option></select></label><button className="dark-button" type="submit">{saved ? "✓ Saved" : "Save profile"}</button></form></section>}
    {activeSection === "model" && <section className="settings-section"><div><h2>Prediction model</h2><p>Daymark uses personalized ridge regression only after {data.forecastModel.minimumDays} matched outcomes. Before that, the displayed number is your observed baseline—not a weighted prediction.</p></div>{[["Method",data.forecastModel.method],["Outcome",data.forecastModel.outcome],["Matched days",`${data.forecastModel.pairedDays} / ${data.forecastModel.minimumDays}`],["Forward-test MAE",data.forecastModel.mae == null ? "Not available yet" : `${data.forecastModel.mae} points`]].map(([label,value])=><div className="weight-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>}
    {activeSection === "integrations" && <section className="settings-section"><div><h2>Calendar connection</h2><p>Daymark reads timed events from your visible selected Google calendars. Titles are used only long enough to classify time as class, study, work, meeting or personal. It stores daily category totals, scheduled minutes and open focus time—not titles, descriptions, attendees, locations or Google access tokens.</p></div><div className="integration-row"><span className="calendar-logo">31</span><div><strong>Google Calendar</strong><small>{connected ? `${data.calendarSummaries.length} private daily summaries saved · sync again after this upgrade` : "Not connected"}</small></div><button className={connected ? "connected-button" : "outline-button"} onClick={()=>void (connected ? onCalendarDisconnect() : onCalendarConnect())}>{connected ? "Disconnect" : "Connect"}</button></div></section>}
    {activeSection === "reminders" && <section className="settings-section"><div><h2>Daily reminders</h2><p>Choose when this device should prompt you to complete your morning check-in and evening review.</p></div><div className="reminder-list"><label><span><strong>Morning check-in</strong><small>Start the day with your sleep, energy and focus plan.</small></span><input type="time" value={morningTime} onChange={(event) => setMorningTime(event.target.value)} disabled={!morningReminder} /><input type="checkbox" checked={morningReminder} onChange={(event) => setMorningReminder(event.target.checked)} aria-label="Enable morning check-in reminder" /></label><label><span><strong>Evening review</strong><small>Record your outcome while the day is still fresh.</small></span><input type="time" value={eveningTime} onChange={(event) => setEveningTime(event.target.value)} disabled={!eveningReminder} /><input type="checkbox" checked={eveningReminder} onChange={(event) => setEveningReminder(event.target.checked)} aria-label="Enable evening review reminder" /></label></div><button className="dark-button settings-save" type="button" onClick={saveReminders}>{remindersSaved ? "✓ Saved on this device" : "Save reminders"}</button></section>}
    {activeSection === "privacy" && <><section className="settings-section"><div><h2>Privacy & consent</h2><p>See exactly how each type of information is used. Daymark never turns personal forecasts into employment assessments.</p></div><div className="consent-summary"><div><span><strong>Private account storage</strong><small>Required to save your profile, check-ins and priorities.</small></span><b>ACTIVE</b></div><div><span><strong>Personal prediction model</strong><small>Uses only your own matched check-ins and evening outcomes.</small></span><b>PERSONAL ONLY</b></div><div><span><strong>Calendar availability</strong><small>{connected ? "You have allowed availability timing to be used." : "No calendar information is connected or used."}</small></span><b className={connected ? "" : "muted-status"}>{connected ? "ALLOWED" : "OFF"}</b></div><div><span><strong>AI daily planning</strong><small>Runs only when you request a plan and does not alter your forecast. Calendar event text is excluded.</small></span><b>ON REQUEST</b></div></div></section><div className="privacy-note"><span>◇</span><p><strong>Private by default.</strong> Every database query is scoped to your signed-in user ID.</p></div></>}
    {activeSection === "export" && <section className="settings-section privacy-control"><div><h2>Export & deletion</h2><p>Download a complete copy of your information or permanently remove your Daymark records.</p></div><div className="control-row"><span>↧</span><div><strong>Export my data</strong><small>Download your real check-ins, outcomes, profile and priorities as JSON.</small></div><button onClick={exportData}>Download</button></div><div className="control-row danger"><span>×</span><div><strong>Delete my account data</strong><small>This permanently removes all Daymark records associated with this account.</small></div><button onClick={()=>void onDelete()}>Delete data</button></div></section>}
  </div></div></>;
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
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e)=>{if(e.target===e.currentTarget) close();}}><form className="checkin-modal" onSubmit={submit}><button type="button" className="modal-close" onClick={close} aria-label="Close">×</button>{onboarding ? <><span className="modal-kicker">SETUP · {step} OF 3</span><div className="modal-progress"><i style={{width:`${step/3*100}%`}} /></div>{step===1&&<><h2>What would you like<br />to improve?</h2><p>Choose your main goal. You can change this later.</p><div className="goal-options"><label><input aria-label="Improve daily focus" type="radio" name="goal" defaultChecked/><span>✦</span><strong>Improve daily focus</strong><small>Find and protect your best deep-work windows</small></label><label><input aria-label="Plan more realistically" type="radio" name="goal"/><span>↗</span><strong>Plan more realistically</strong><small>Match daily workload to your actual capacity</small></label><label><input aria-label="Build healthier routines" type="radio" name="goal"/><span>☼</span><strong>Build healthier routines</strong><small>Understand how habits affect your work</small></label></div></>}{step===2&&<><h2>Set your typical<br />working day.</h2><p>This helps us understand your calendar availability.</p><div className="field-row"><label>START TIME<input type="time" defaultValue="09:00" /></label><label>END TIME<input type="time" defaultValue="17:00" /></label></div><label className="full-field">WORKING DAYS<select defaultValue="weekdays"><option value="weekdays">Monday to Friday</option><option>Every day</option></select></label></>}{step===3&&<><h2>You’re in control<br />of every signal.</h2><p>Your check-ins, outcomes and priorities are now saved to your private account.</p><div className="consent-list"><label><input aria-label="Daily check-ins" type="checkbox" defaultChecked/><span><strong>Daily check-ins</strong><small>Sleep, energy, stress, goals and outcomes</small></span></label><label><input aria-label="Calendar summaries" type="checkbox"/><span><strong>Calendar summaries</strong><small>Meeting count, duration and free blocks only</small></span></label><label><input aria-label="Personal model training" type="checkbox" defaultChecked/><span><strong>Personal model training</strong><small>Use my data to improve my own forecasts</small></span></label></div></>}<button className="modal-submit" disabled={saving}>{step<3?"Continue":saving?"Saving…":"Start my baseline"}<span>→</span></button></> : <><span className="modal-kicker">{evening ? "EVENING REVIEW" : "MORNING CHECK-IN"} · UNDER 60 SECONDS</span><h2>{evening ? "Rate today’s work performance." : "How are you starting today?"}</h2><p>{evening ? "Use the anchored 0–10 scale consistently. This becomes the outcome used to test your personal model." : "Small signals help Daymark understand your capacity."}</p>{evening ? <><label className="range-field"><span><strong>Overall work performance</strong><b>{productivity} / 10</b></span><input aria-label="Overall work performance from zero, the worst performance, to ten, top performance" type="range" min="0" max="10" value={productivity} onChange={e=>setProductivity(Number(e.target.value))} /><small>0 = worst performance · 10 = top performance</small></label><label className="range-field"><span><strong>Focused work</strong><b>{focus} min</b></span><input aria-label="Focused work" type="range" min="0" max="240" step="15" value={focus} onChange={e=>setFocus(Number(e.target.value))}/></label><label className="full-field">SHORT REFLECTION<textarea value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="What helped or interrupted you today?" /></label></> : <><label className="range-field"><span><strong>Energy</strong><b>{energy} / 5</b></span><input aria-label="Energy" type="range" min="1" max="5" value={energy} onChange={e=>setEnergy(Number(e.target.value))}/></label><label className="range-field"><span><strong>Stress</strong><b>{stress} / 5</b></span><input aria-label="Stress" type="range" min="1" max="5" value={stress} onChange={e=>setStress(Number(e.target.value))}/></label><label className="range-field"><span><strong>Planned focus time</strong><b>{focus} min</b></span><input aria-label="Planned focus time" type="range" min="30" max="240" step="15" value={focus} onChange={e=>setFocus(Number(e.target.value))}/></label><div className="field-row"><label>SLEEP DURATION<input type="text" value={sleep} onChange={(event) => setSleep(event.target.value)} /></label><label>WORKLOAD<select value={workload} onChange={(event) => setWorkload(event.target.value)}><option value="light">Light</option><option value="normal">Normal</option><option value="heavy">Heavy</option></select></label></div></>}<button className="modal-submit" disabled={saving}>{saving ? "Saving…" : `Save ${evening ? "review" : "check-in"}`}<span>→</span></button></>}</form></div>;
}

function Dashboard({ exit, initialOnboarding = false, authenticated = false, calendarProviderToken = null }: { exit: () => void; initialOnboarding?: boolean; authenticated?: boolean; calendarProviderToken?: string | null }) {
  const [view, setView] = useState<View>("today");
  const [transitionState, setTransitionState] = useState<"ready" | "leaving" | "entering">("ready");
  const [modal, setModal] = useState<Modal>(initialOnboarding ? "onboarding" : null);
  const [tourOpen, setTourOpen] = useState(false);
  const [data, setData] = useState<DaymarkData>(demoData);
  const [syncMessage, setSyncMessage] = useState("Loading your workspace…");
  const transitionTimer = useRef<number | null>(null);
  const titles = useMemo(() => ({ today: "Today", forecast: "Forecast", insights: "Insights", report: "Weekly report", settings: "Settings" }), []);
  useEffect(() => { document.title = `${titles[view]} · Daymark`; }, [view, titles]);
  useEffect(() => () => { if (transitionTimer.current) window.clearTimeout(transitionTimer.current); }, []);
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

  const updateData = useCallback(async (payload: Record<string, unknown>) => { try { setSyncMessage("Saving…"); const next = await daymarkAction(payload); setData(next); setSyncMessage("Saved privately to your account"); return true; } catch (error) { setSyncMessage(error instanceof Error ? error.message : "Your changes could not be saved."); return false; } }, []);
  useEffect(() => {
    if (!authenticated || !calendarProviderToken || localStorage.getItem("daymark-calendar-connect:v1") !== "pending") return;
    localStorage.removeItem("daymark-calendar-connect:v1");
    const timer = window.setTimeout(() => { void updateData({ action: "calendar.sync", providerToken: calendarProviderToken, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" }); }, 0);
    return () => window.clearTimeout(timer);
  }, [authenticated, calendarProviderToken, updateData]);
  const saveCheckin = async (payload: CheckinPayload) => { const beginTour = modal === "onboarding"; const saved = await updateData({ action: "checkin.save", ...payload }); if (!saved) return; setModal(null); if (beginTour) window.setTimeout(() => setTourOpen(true), 300); };
  const addPriority = async (title: string) => { if (!authenticated) { setData((current) => ({ ...current, priorities: [...current.priorities, { id: Math.min(-1, ...current.priorities.map((priority) => priority.id)) - 1, title, impact: "MEDIUM IMPACT", completed: false }] })); setSyncMessage("Demo change · Sign in to save it"); return true; } return updateData({ action: "priority.create", title, impact: "MEDIUM IMPACT" }); };
  const togglePriority = async (id: number, completed: boolean) => { if (!authenticated || id < 0) { setData((current) => ({ ...current, priorities: current.priorities.map((priority) => priority.id === id ? { ...priority, completed } : priority) })); setSyncMessage("Demo change · Sign in to save it"); return; } await updateData({ action: "priority.toggle", id, completed }); };
  const connectCalendar = async () => { if (!authenticated) { setSyncMessage("Sign in first to connect your private calendar."); return; } localStorage.setItem("daymark-calendar-connect:v1", "pending"); window.location.assign("/api/auth/google-calendar"); };
  const disconnectCalendar = async () => { await updateData({ action: "calendar.disconnect" }); };
  const deleteData = async () => { if (!window.confirm("Permanently delete all of your Daymark check-ins, priorities and settings?")) return; const response = await daymarkFetch("/api/daymark", { method: "DELETE" }); if (!response.ok) { const payload = await response.json(); setSyncMessage(payload.error ?? "Your data could not be deleted."); return; } setData({ ...demoData, user: data.user, profile: { ...demoData.profile!, displayName: data.user.displayName, email: data.user.email } }); setSyncMessage("Your Daymark data has been deleted"); };
  const handleExit = async () => { if (authenticated && isSupabaseConfigured) await getSupabaseBrowserClient().auth.signOut(); exit(); };

  return <main className="app-shell"><Sidebar view={view} setView={changeView} exit={handleExit} startTour={startTour} data={data} /><div className="app-main"><div className="sync-banner" role="status"><span className={syncMessage.startsWith("Saved") ? "online" : ""} />{syncMessage}</div><div className={`view-stage ${transitionState}`} aria-live="polite">{view === "today" && <Today setModal={setModal} data={data} authenticated={authenticated} onAddPriority={addPriority} onTogglePriority={togglePriority} onCalendarConnect={connectCalendar} onOpenInsights={() => changeView("insights")} />}{view === "forecast" && <Forecast setModal={setModal} data={data} />}{view === "insights" && <Insights setModal={setModal} data={data} />}{view === "report" && <Report setModal={setModal} />}{view === "settings" && <Settings setModal={setModal} data={data} onCalendarConnect={connectCalendar} onCalendarDisconnect={disconnectCalendar} onProfileUpdate={async (displayName, goal) => { await updateData({ action: "profile.update", displayName, goal }); }} onDelete={deleteData} />}</div><footer className="app-footer"><span>Daymark predictions support personal reflection. They are not medical or employment advice.</span><span>Privacy · Help</span></footer></div>{modal && <CheckInModal modal={modal} close={() => setModal(null)} onSaved={saveCheckin} />}{tourOpen && !modal && <GuidedTour onClose={() => setTourOpen(false)} />}</main>;
}

export default function Home() {
  const [experience, setExperience] = useState<"marketing" | "demo" | "onboarding">("marketing");
  const [authOpen, setAuthOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [calendarProviderToken, setCalendarProviderToken] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const passwordRecoveryInProgress = useRef(false);
  const onboardingAfterSignIn = useRef(false);
  useEffect(() => { document.title = experience === "marketing" ? "Daymark · Personal productivity forecasting" : "Today · Daymark"; }, [experience]);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session || passwordRecoveryInProgress.current) return;
      setAuthenticated(true);
      setCalendarProviderToken(data.session.provider_token ?? null);
      setExperience("demo");
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthenticated(Boolean(session));
      setCalendarProviderToken(session?.provider_token ?? null);
      if (event === "PASSWORD_RECOVERY") {
        passwordRecoveryInProgress.current = true;
        setPasswordRecovery(true);
        setAuthOpen(true);
        setExperience("marketing");
        return;
      }
      if (session) {
        passwordRecoveryInProgress.current = false;
        setPasswordRecovery(false);
        setAuthOpen(false);
        setExperience(onboardingAfterSignIn.current ? "onboarding" : "demo");
        onboardingAfterSignIn.current = false;
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const signIn = (onboarding = false) => { onboardingAfterSignIn.current = onboarding; passwordRecoveryInProgress.current = false; setPasswordRecovery(false); setAuthOpen(true); };
  if (experience === "marketing") return <><Marketing onStart={() => signIn(true)} onDemo={() => setExperience("demo")} onSignIn={() => signIn(false)} />{authOpen ? <AuthDialog key={passwordRecovery ? "password-recovery" : "account-access"} recoveryMode={passwordRecovery} onRecovered={() => { passwordRecoveryInProgress.current = false; setPasswordRecovery(false); setAuthOpen(false); setExperience("demo"); }} onClose={() => setAuthOpen(false)} /> : null}</>;
  return <Dashboard authenticated={authenticated} calendarProviderToken={calendarProviderToken} initialOnboarding={experience === "onboarding"} exit={() => setExperience("marketing")} />;
}
