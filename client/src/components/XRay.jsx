export default function XRay({ data }) {
  const { guide, languages, totalFiles, sources } = data;
  const total = Object.values(languages || {}).reduce((a, b) => a + b, 0);
  const langs = Object.entries(languages || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, bytes]) => ({ name, pct: total ? Math.max(1, Math.round((bytes / total) * 100)) : 0 }));

  return (
    <div className="stack">
      <section className="card">
        <h3>What is this project?</h3>
        <p className="lead">{guide.summary}</p>
        <p className="muted small">
          {totalFiles} files analysed
          {sources.length ? <> • Read: {sources.join(", ")}</> : null}
        </p>
      </section>

      <div className="grid-2">
        <section className="card">
          <h3>Technologies</h3>
          {langs.length > 0 && (
            <div className="langbar" aria-label="Language breakdown">
              {langs.map((l, i) => (
                <span key={l.name} className={`seg seg-${i}`} style={{ width: `${l.pct}%` }} title={`${l.name} ${l.pct}%`} />
              ))}
            </div>
          )}
          <ul className="chips">
            {guide.techStack.map((t) => (
              <li key={t.name} className="chip" title={t.note}>
                {t.name}
              </li>
            ))}
          </ul>
          {guide.techStack.length === 0 && <p className="muted">No technologies detected.</p>}
        </section>

        <section className="card">
          <h3>Questions to explore</h3>
          <ul className="plain">
            {guide.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <h3>Important folders</h3>
        {guide.keyFolders.length === 0 ? (
          <p className="muted">This repository keeps its files at the top level (no folders found).</p>
        ) : (
          <ul className="rows">
            {guide.keyFolders.map((f) => (
              <li key={f.path}>
                <a href={f.url} target="_blank" rel="noreferrer" className="mono">
                  {f.path}/
                </a>
                <span>{f.explanation}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h3>Files to read first</h3>
        <ul className="rows">
          {guide.keyFiles.map((f) => (
            <li key={f.path}>
              <a href={f.url} target="_blank" rel="noreferrer" className="mono">
                {f.path}
              </a>
              <span>{f.why}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
