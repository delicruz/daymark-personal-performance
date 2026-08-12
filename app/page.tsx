"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type View = "today" | "forecast" | "insights" | "report" | "settings";
type Modal = "morning" | "evening" | "onboarding" | null;

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

function Marketing({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  return (
    <main className="marketing">
      <header className="marketing-nav">
        <Logo />
        <nav aria-label="Main navigation">
          <a href="#how">How it works</a>
          <a href="#privacy">Privacy</a>
          <a href="#science">Our approach</a>
        </nav>
        <div className="nav-actions">
          <button className="link-button" onClick={onDemo}>Sign in</button>
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

      <section className="final-cta">
        <p>MAKE TOMORROW MORE INTENTIONAL</p>
        <h2>Start noticing what<br /><em>moves your day.</em></h2>
        <button className="primary-cta light-cta" onClick={onStart}>Build my baseline <span className="solid-arrow" aria-hidden="true" /></button>
      </section>

      <footer className="marketing-footer"><Logo /><span>© 2026 Daymark</span><div><a href="#privacy">Privacy</a><a href="#how">How it works</a></div></footer>
    </main>
  );
}

function Sidebar({ view, setView, exit, startTour }: { view: View; setView: (view: View) => void; exit: () => void; startTour: () => void }) {
  return (
    <aside className="sidebar">
      <Logo dark />
      <nav aria-label="Dashboard navigation" data-tour="navigation">
        {navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} aria-label={item.label} data-label={item.label} aria-current={view === item.id ? "page" : undefined} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}
      </nav>
      <div className="baseline-box"><span>BASELINE</span><strong>24 of 30 days</strong><div><i /></div><small>6 more days to improve accuracy</small></div>
      <button className="tour-restart" aria-label="Open guided tour" data-label="Guided tour" onClick={startTour}><span>?</span><strong>Guided tour</strong></button>
      <button className="profile-block" onClick={exit}><b>TD</b><span><strong>Tri Dung</strong><small>Personal workspace</small></span><em>⋯</em></button>
    </aside>
  );
}

function AppHeader({ title, subtitle, setModal }: { title: string; subtitle: string; setModal: (modal: Modal) => void }) {
  return (
    <header className="app-header"><div><p>{subtitle}</p><h1>{title}</h1></div><div className="header-actions"><button className="icon-button" aria-label="Notifications">♢<i /></button><button className="outline-button" onClick={() => setModal("morning")}>☼ Morning check-in</button><button className="dark-button" onClick={() => setModal("evening")}>Evening review <span>→</span></button></div></header>
  );
}

function Today({ setModal, prediction }: { setModal: (modal: Modal) => void; prediction: number }) {
  return (
    <>
      <AppHeader title="Good morning, Tri." subtitle="WEDNESDAY · 12 AUGUST" setModal={setModal} />
      <div className="dashboard-grid">
        <section className="outlook-card" data-tour="outlook">
          <div className="card-label"><span>✦</span> TOMORROW’S PRODUCTIVITY OUTLOOK <button aria-label="More options">•••</button></div>
          <div className="outlook-main">
            <div><span className="outlook-date">THURSDAY · 13 AUGUST</span><h2>A strong day for<br /><em>deep work.</em></h2><p>Your outlook is above your 30-day average. Protect your morning focus window for the work that matters most.</p></div>
            <div className="large-score-ring" style={{ "--score": prediction } as React.CSSProperties}><div><strong>{prediction}</strong><span>/100</span><small>GOOD</small></div></div>
          </div>
          <div className="confidence-line"><span><i /> Moderate confidence</span><strong>Expected range {prediction - 7}–{prediction + 6}</strong><small>Based on 24 recorded days</small></div>
          <div className="recommendation wide"><span>✦</span><div><small>YOUR BEST NEXT MOVE</small><strong>Protect 9–11am for your hardest priority.</strong><p>Your energy is typically highest before your first meeting.</p></div><button>View schedule <span>→</span></button></div>
        </section>

        <section className="checkin-card" data-tour="checkin">
          <div className="card-label">TODAY’S CHECK-IN <span className="complete-pill">✓ COMPLETE</span></div>
          <div className="wellbeing-row"><div><span>☼</span><small>ENERGY</small><strong>4 / 5</strong></div><div><span>◌</span><small>MOOD</small><strong>4 / 5</strong></div><div><span>⌁</span><small>STRESS</small><strong>2 / 5</strong></div></div>
          <div className="sleep-line"><span>☾</span><div><small>LAST NIGHT’S SLEEP</small><strong>7h 42m <em>Good</em></strong></div></div>
          <button className="text-action" onClick={() => setModal("morning")}>Edit check-in <span>→</span></button>
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
          <div className="card-label">TODAY’S PRIORITIES <span>2 OF 3 COMPLETE</span></div>
          {["Finish project proposal", "Review research notes", "Plan tomorrow’s focus block"].map((item, index) => <label key={item}><input type="checkbox" defaultChecked={index < 2} /><span>{item}</span><small>{index === 0 ? "HIGH IMPACT" : index === 1 ? "45 MIN" : "20 MIN"}</small></label>)}
          <button className="text-action">+ Add priority</button>
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

function Settings({ setModal }: { setModal: (modal: Modal) => void }) {
  const [connected, setConnected] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const exportData = () => { const data = JSON.stringify({ product: "Daymark", exportedAt: new Date().toISOString(), checkIns: 24, productivityAverage: 71 }, null, 2); const url = URL.createObjectURL(new Blob([data], {type:"application/json"})); const a=document.createElement("a"); a.href=url; a.download="daymark-data.json"; a.click(); URL.revokeObjectURL(url); };
  return <><AppHeader title="Your data, your choices." subtitle="DATA & SETTINGS" setModal={setModal} /><div className="settings-layout"><nav aria-label="Settings sections"><button className="active">Profile</button><button>Productivity score</button><button>Integrations</button><button>Reminders</button><button>Privacy & consent</button><button>Export & deletion</button></nav><div className="settings-content"><section className="settings-section"><div><h2>Calendar connection</h2><p>Daymark only reads event times and availability. Titles, descriptions, attendees and meeting contents are never stored.</p></div><div className="integration-row"><span className="calendar-logo">31</span><div><strong>Google Calendar</strong><small>{connected ? "Connected · Last synced moments ago" : "Not connected"}</small></div><button className={connected ? "connected-button" : "outline-button"} onClick={()=>setConnected(!connected)}>{connected ? "✓ Connected" : "Connect"}</button></div></section><section className="settings-section"><div><h2>Productivity score</h2><p>Your score combines four signals. These default weights can be personalised once your baseline is complete.</p></div>{[["Priority completion",35],["Self-rated productivity",30],["Focus target achieved",25],["Schedule adherence",10]].map(([label,value])=><div className="weight-row" key={label}><span>{label}</span><div><i style={{width:`${value}%`}} /></div><strong>{value}%</strong></div>)}</section><section className="settings-section privacy-control"><div><h2>Privacy controls</h2><p>Review consent, download a copy of your information, or permanently remove everything.</p></div><div className="control-row"><span>↧</span><div><strong>Export my data</strong><small>Download check-ins, outcomes and predictions as JSON.</small></div><button onClick={exportData}>Download</button></div><div className="control-row danger"><span>×</span><div><strong>Delete my account and data</strong><small>This permanently removes all personal information.</small></div><button onClick={()=>setDeleted(true)}>{deleted ? "Request recorded" : "Delete data"}</button></div></section><div className="privacy-note"><span>◇</span><p><strong>Private by default.</strong> Your personal forecast is never shared with an employer, used to rank you, or sold to advertisers.</p></div></div></div></>;
}

function CheckInModal({ modal, close, onSaved }: { modal: Exclude<Modal, null>; close: () => void; onSaved: (score?: number) => void }) {
  const [step, setStep] = useState(1);
  const [energy, setEnergy] = useState(4);
  const [stress, setStress] = useState(2);
  const [focus, setFocus] = useState(120);
  const onboarding = modal === "onboarding";
  const evening = modal === "evening";
  const submit = (event: FormEvent) => { event.preventDefault(); if (onboarding && step < 3) { setStep(step + 1); return; } onSaved(Math.min(88, 68 + energy * 3 - stress + Math.round(focus / 60))); };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e)=>{if(e.target===e.currentTarget) close();}}><form className="checkin-modal" onSubmit={submit}><button type="button" className="modal-close" onClick={close} aria-label="Close">×</button>{onboarding ? <><span className="modal-kicker">SETUP · {step} OF 3</span><div className="modal-progress"><i style={{width:`${step/3*100}%`}} /></div>{step===1&&<><h2>What would you like<br />to improve?</h2><p>Choose your main goal. You can change this later.</p><div className="goal-options"><label><input aria-label="Improve daily focus" type="radio" name="goal" defaultChecked/><span>✦</span><strong>Improve daily focus</strong><small>Find and protect your best deep-work windows</small></label><label><input aria-label="Plan more realistically" type="radio" name="goal"/><span>↗</span><strong>Plan more realistically</strong><small>Match daily workload to your actual capacity</small></label><label><input aria-label="Build healthier routines" type="radio" name="goal"/><span>☼</span><strong>Build healthier routines</strong><small>Understand how habits affect your work</small></label></div></>}{step===2&&<><h2>Set your typical<br />working day.</h2><p>This helps us understand your calendar availability.</p><div className="field-row"><label>START TIME<input type="time" defaultValue="09:00" /></label><label>END TIME<input type="time" defaultValue="17:00" /></label></div><label className="full-field">WORKING DAYS<select defaultValue="weekdays"><option value="weekdays">Monday to Friday</option><option>Every day</option></select></label></>}{step===3&&<><h2>You’re in control<br />of every signal.</h2><p>Start with manual check-ins. Calendar summaries are optional and never include event contents.</p><div className="consent-list"><label><input aria-label="Daily check-ins" type="checkbox" defaultChecked/><span><strong>Daily check-ins</strong><small>Sleep, energy, stress, goals and outcomes</small></span></label><label><input aria-label="Calendar summaries" type="checkbox"/><span><strong>Calendar summaries</strong><small>Meeting count, duration and free blocks only</small></span></label><label><input aria-label="Personal model training" type="checkbox" defaultChecked/><span><strong>Personal model training</strong><small>Use my data to improve my own forecasts</small></span></label></div></>}<button className="modal-submit">{step<3?"Continue":"Start my baseline"}<span>→</span></button></> : <><span className="modal-kicker">{evening ? "EVENING REVIEW" : "MORNING CHECK-IN"} · UNDER 60 SECONDS</span><h2>{evening ? "How did today go?" : "How are you starting today?"}</h2><p>{evening ? "Your reflection helps tomorrow’s forecast improve." : "Small signals help Daymark understand your capacity."}</p>{evening ? <><label className="range-field"><span><strong>Productivity</strong><b>8 / 10</b></span><input aria-label="Productivity" type="range" min="1" max="10" defaultValue="8" /></label><label className="range-field"><span><strong>Focused work</strong><b>{focus} min</b></span><input aria-label="Focused work" type="range" min="0" max="240" step="15" value={focus} onChange={e=>setFocus(Number(e.target.value))}/></label><label className="full-field">SHORT REFLECTION<textarea placeholder="What helped or interrupted you today?" /></label></> : <><label className="range-field"><span><strong>Energy</strong><b>{energy} / 5</b></span><input aria-label="Energy" type="range" min="1" max="5" value={energy} onChange={e=>setEnergy(Number(e.target.value))}/></label><label className="range-field"><span><strong>Stress</strong><b>{stress} / 5</b></span><input aria-label="Stress" type="range" min="1" max="5" value={stress} onChange={e=>setStress(Number(e.target.value))}/></label><label className="range-field"><span><strong>Planned focus time</strong><b>{focus} min</b></span><input aria-label="Planned focus time" type="range" min="30" max="240" step="15" value={focus} onChange={e=>setFocus(Number(e.target.value))}/></label><div className="field-row"><label>SLEEP DURATION<input type="text" defaultValue="7h 42m" /></label><label>WORKLOAD<select defaultValue="normal"><option value="light">Light</option><option value="normal">Normal</option><option value="heavy">Heavy</option></select></label></div></>}<button className="modal-submit">Save {evening ? "review" : "check-in"}<span>→</span></button></>}</form></div>;
}

function Dashboard({ exit, initialOnboarding = false }: { exit: () => void; initialOnboarding?: boolean }) {
  const [view, setView] = useState<View>("today");
  const [transitionState, setTransitionState] = useState<"ready" | "leaving" | "entering">("ready");
  const [modal, setModal] = useState<Modal>(initialOnboarding ? "onboarding" : null);
  const [tourOpen, setTourOpen] = useState(false);
  const [prediction, setPrediction] = useState(74);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titles = useMemo(() => ({ today: "Today", forecast: "Forecast", insights: "Insights", report: "Weekly report", settings: "Settings" }), []);
  useEffect(() => { document.title = `${titles[view]} · Daymark`; }, [view, titles]);
  useEffect(() => () => { if (transitionTimer.current) clearTimeout(transitionTimer.current); }, []);
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

  return <main className="app-shell"><Sidebar view={view} setView={changeView} exit={exit} startTour={startTour} /><div className="app-main"><div className={`view-stage ${transitionState}`} aria-live="polite">{view === "today" && <Today setModal={setModal} prediction={prediction} />}{view === "forecast" && <Forecast setModal={setModal} />}{view === "insights" && <Insights setModal={setModal} />}{view === "report" && <Report setModal={setModal} />}{view === "settings" && <Settings setModal={setModal} />}</div><footer className="app-footer"><span>Daymark predictions support personal reflection. They are not medical or employment advice.</span><span>Privacy · Help</span></footer></div>{modal && <CheckInModal modal={modal} close={() => setModal(null)} onSaved={(score) => { const beginTour = modal === "onboarding"; if (score) setPrediction(score); setModal(null); localStorage.setItem("daymark-checkin", new Date().toISOString()); if (beginTour) window.setTimeout(() => setTourOpen(true), 300); }} />}{tourOpen && !modal && <GuidedTour onClose={() => setTourOpen(false)} />}</main>;
}

export default function Home() {
  const [experience, setExperience] = useState<"marketing" | "demo" | "onboarding">("marketing");
  useEffect(() => { document.title = experience === "marketing" ? "Daymark · Personal productivity forecasting" : "Today · Daymark"; }, [experience]);
  if (experience === "marketing") return <Marketing onStart={() => setExperience("onboarding")} onDemo={() => setExperience("demo")} />;
  return <Dashboard initialOnboarding={experience === "onboarding"} exit={() => setExperience("marketing")} />;
}
