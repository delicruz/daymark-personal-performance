const projects = [
  {
    index: "01",
    title: "Real-Time Human Motion Tracking",
    description:
      "Built two complementary motion-tracking pipelines: quaternion-based IMU orientation with sensor fusion, and computer vision for elbow and wrist joint-angle estimation.",
    outcome: "2026 Research Scholarship",
    tags: ["Python", "MediaPipe", "OpenCV"],
    color: "orange",
  },
  {
    index: "02",
    title: "C++ Turn-Based Strategy Game",
    description:
      "Designed player and enemy class systems, battle mechanics, and state management using inheritance and polymorphism for a structured, extensible game architecture.",
    outcome: "OOP Architecture",
    tags: ["C++", "Algorithms", "Polymorphism"],
    color: "purple",
  },
  {
    index: "03",
    title: "Statistical Reports in R",
    description:
      "Created analysis pipelines for survey and experimental data, applying regression, hypothesis testing, and ANOVA with clear visual reporting.",
    outcome: "Statistical Modelling",
    tags: ["R", "ggplot2", "ANOVA"],
    color: "lime",
  },
];

const toolkit = [
  { group: "Programming", items: ["Python", "R", "C++", "Object-oriented design"] },
  { group: "Data & statistics", items: ["Regression", "Hypothesis testing", "ANOVA", "Probability theory"] },
  { group: "Vision & sensing", items: ["OpenCV", "MediaPipe", "Sensor fusion", "Quaternion tracking"] },
  { group: "Tools", items: ["Git / GitHub", "Jupyter", "Power BI", "Excel"] },
];

function ArrowIcon() {
  return <span aria-hidden="true">-&gt;</span>;
}

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Back to top">
          <span className="brand-mark">TG</span>
          <span>TRI DUNG / DATA</span>
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
          <p className="eyebrow">Computer Science / University of Adelaide</p>
          <h1>
            I build intelligent
            <br />
            systems from <span className="highlight">real data.</span>
          </h1>
          <p className="hero-intro">
            Computer Science student focused on data science, statistics, and
            machine learning - from rigorous analysis to real-time sensing systems.
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

        <div className="data-poster" aria-label="Research motion-tracking project card">
          <div className="poster-topline">
            <span>RESEARCH_2026</span>
            <span>MOTION TRACKING</span>
          </div>
          <div className="poster-score">
            <span className="score-label">PIPELINES</span>
            <strong>02</strong>
          </div>
          <div className="chart" aria-hidden="true">
            {[38, 62, 51, 84, 69, 92, 78, 97].map((height, index) => (
              <span key={index} style={{ height: `${height}%` }} />
            ))}
          </div>
          <div className="poster-footer">
            <span>IMU / VISION</span>
            <span>REAL-TIME</span>
          </div>
          <div className="poster-sticker">LEARN<br />BUILD<br />ITERATE</div>
        </div>
      </section>

      <section className="proof-strip" aria-label="Highlights">
        <div><strong>6.4</strong><span>GPA / 7.0</span></div>
        <div><strong>2026</strong><span>Research scholarship</span></div>
        <div><strong>03</strong><span>Featured builds</span></div>
        <p>Research-minded.<br />Built in practice.</p>
      </section>

      <section className="projects section" id="work">
        <div className="section-heading">
          <p className="eyebrow">Research &amp; selected work</p>
          <h2>Built beyond the classroom.</h2>
          <p>
            From real-time motion tracking to statistical analysis and
            object-oriented software design.
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
          <h2>Research driven.<br /><em>Always</em> learning.</h2>
        </div>
        <div className="about-copy">
          <p className="lead">
            I&apos;m a Computer Science student at the University of Adelaide with
            a 6.4/7.0 GPA and a growing focus on data science and machine learning.
          </p>
          <p>
            As a 2026 Adelaide Summer Research Scholarship student, I developed
            real-time human motion tracking with IMU sensor fusion, MediaPipe,
            and OpenCV under the supervision of Mr. Siu Wai Ho.
          </p>
          <p>
            I enjoy combining statistical reasoning with practical software
            engineering, and I&apos;m looking for opportunities to keep learning
            while contributing to useful data and ML systems.
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
        <a className="contact-link" href="mailto:a19198839@adelaide.edu.au">
          a19198839@adelaide.edu.au <ArrowIcon />
        </a>
        <div className="contact-note">
          <span>Available for internships &amp; graduate roles</span>
          <span>Based in Adelaide / Open to remote</span>
        </div>
      </section>

      <footer>
        <span>(c) 2026 Tri Dung Giap</span>
        <div>
          <a href="https://github.com/delicruz" target="_blank" rel="noreferrer">GitHub <ArrowIcon /></a>
          <a href="https://www.linkedin.com/in/tri-dung-giap-117374338/" target="_blank" rel="noreferrer">LinkedIn <ArrowIcon /></a>
        </div>
        <a href="#top">Back to top</a>
      </footer>
    </main>
  );
}
