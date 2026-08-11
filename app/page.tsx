const projects = [
  {
    index: "01",
    title: "Forecasting City Bike Demand",
    description:
      "Built a time-series forecasting pipeline to predict hourly bike demand and help operators rebalance stations before peak periods.",
    outcome: "18% lower MAE",
    tags: ["Python", "XGBoost", "Time Series"],
    color: "orange",
  },
  {
    index: "02",
    title: "Customer Churn, Explained",
    description:
      "Compared interpretable classification models and translated SHAP insights into retention actions for a subscription business.",
    outcome: "0.87 ROC-AUC",
    tags: ["scikit-learn", "SHAP", "SQL"],
    color: "purple",
  },
  {
    index: "03",
    title: "Review Intelligence Engine",
    description:
      "Designed an NLP workflow that groups product feedback by theme and surfaces emerging issues from thousands of reviews.",
    outcome: "8 themes discovered",
    tags: ["NLP", "BERT", "Streamlit"],
    color: "lime",
  },
];

const toolkit = [
  { group: "Languages", items: ["Python", "SQL", "R"] },
  { group: "Machine learning", items: ["scikit-learn", "PyTorch", "XGBoost"] },
  { group: "Data & visualisation", items: ["Pandas", "Tableau", "Power BI"] },
  { group: "Workflow", items: ["Git", "Docker", "Jupyter"] },
];

function ArrowIcon() {
  return <span aria-hidden="true">-&gt;</span>;
}

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Back to top">
          <span className="brand-mark">DN</span>
          <span>DUNG / DATA</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#work">Work</a>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
        </nav>
        <a className="availability" href="#contact">
          <span className="status-dot" /> Open to opportunities
        </a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Data science student / Adelaide, AU</p>
          <h1>
            I turn messy data
            <br />
            into <span className="highlight">clear decisions.</span>
          </h1>
          <p className="hero-intro">
            Aspiring data scientist and machine learning engineer building
            thoughtful, useful models - from first question to final story.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#work">
              Explore my work <ArrowIcon />
            </a>
            <a className="text-link" href="#contact">
              Get in touch <span aria-hidden="true">-&gt;</span>
            </a>
          </div>
        </div>

        <div className="data-poster" aria-label="Decorative model performance card">
          <div className="poster-topline">
            <span>MODEL_03</span>
            <span>VALIDATION</span>
          </div>
          <div className="poster-score">
            <span className="score-label">F1 SCORE</span>
            <strong>.91</strong>
          </div>
          <div className="chart" aria-hidden="true">
            {[38, 62, 51, 84, 69, 92, 78, 97].map((height, index) => (
              <span key={index} style={{ height: `${height}%` }} />
            ))}
          </div>
          <div className="poster-footer">
            <span>TRAIN / TEST</span>
            <span>+12.4%</span>
          </div>
          <div className="poster-sticker">LEARN<br />BUILD<br />ITERATE</div>
        </div>
      </section>

      <section className="proof-strip" aria-label="Highlights">
        <div><strong>03</strong><span>End-to-end projects</span></div>
        <div><strong>12+</strong><span>Models explored</span></div>
        <div><strong>ALWAYS</strong><span>Questions to ask</span></div>
        <p>Curious by default.<br />Rigorous by design.</p>
      </section>

      <section className="projects section" id="work">
        <div className="section-heading">
          <p className="eyebrow">Selected work / 2026</p>
          <h2>Projects with a point.</h2>
          <p>
            Each project starts with a real question and ends with a result
            someone can understand and use.
          </p>
        </div>
        <div className="project-grid">
          {projects.map((project) => (
            <article className={`project-card ${project.color}`} key={project.title}>
              <div className="project-top">
                <span>{project.index}</span>
                <span className="project-arrow"><ArrowIcon /></span>
              </div>
              <div>
                <p className="outcome">{project.outcome}</p>
                <h3>{project.title}</h3>
                <p className="project-description">{project.description}</p>
              </div>
              <ul className="tag-list" aria-label="Technologies used">
                {project.tags.map((tag) => <li key={tag}>{tag}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="about section" id="about">
        <div className="about-title">
          <p className="eyebrow">A little about me</p>
          <h2>Equal parts<br /><em>logic</em> &amp; curiosity.</h2>
        </div>
        <div className="about-copy">
          <p className="lead">
            I&apos;m a data science student who enjoys finding the signal in the
            noise - and explaining it without the jargon.
          </p>
          <p>
            My interests sit at the intersection of machine learning,
            experimentation, and responsible product decisions. I care about
            clean analysis, honest evaluation, and building things that are
            genuinely useful.
          </p>
          <p>
            Right now, I&apos;m looking for internships and graduate opportunities
            where I can learn from a strong team and contribute from day one.
          </p>
        </div>
      </section>

      <section className="toolkit section" aria-labelledby="toolkit-heading">
        <div className="section-heading compact">
          <p className="eyebrow">Technical toolkit</p>
          <h2 id="toolkit-heading">What I work with.</h2>
        </div>
        <div className="toolkit-grid">
          {toolkit.map((set, index) => (
            <div className="tool-group" key={set.group}>
              <span className="tool-number">0{index + 1}</span>
              <h3>{set.group}</h3>
              <ul>
                {set.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="contact section" id="contact">
        <p className="eyebrow">Let&apos;s make something useful</p>
        <h2>Have a problem<br />worth solving?</h2>
        <a className="contact-link" href="mailto:hello@yourname.dev">
          hello@yourname.dev <ArrowIcon />
        </a>
        <div className="contact-note">
          <span>Available for internships &amp; graduate roles</span>
          <span>Based in Adelaide / Open to remote</span>
        </div>
      </section>

      <footer>
        <span>(c) 2026 Dung Nguyen</span>
        <div>
          <a href="https://github.com/" target="_blank" rel="noreferrer">GitHub <ArrowIcon /></a>
          <a href="https://www.linkedin.com/" target="_blank" rel="noreferrer">LinkedIn <ArrowIcon /></a>
        </div>
        <a href="#top">Back to top</a>
      </footer>
    </main>
  );
}
