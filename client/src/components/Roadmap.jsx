export default function Roadmap({ data }) {
  const { steps, issues, issuesUrl } = data.roadmap;

  return (
    <div className="stack">
      <section className="card">
        <h3>Your path to a first contribution</h3>
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={`${i}-${s.title}`}>
              <span className="num">{i + 1}</span>
              <div>
                <strong>{s.title}</strong>
                <p>{s.detail}</p>
                {s.link && (
                  <a href={s.link} target="_blank" rel="noreferrer" className="link">
                    Open on GitHub ↗
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h3>Issues you could look at</h3>
        {issues.length === 0 ? (
          <p className="muted">
            No open "good first issue" or "help wanted" issues were found.{" "}
            <a href={issuesUrl} target="_blank" rel="noreferrer" className="link">
              Check the Issues tab yourself ↗
            </a>
          </p>
        ) : (
          <>
            <ul className="rows issue-list">
              {issues.map((i) => (
                <li key={i.number}>
                  <a href={i.url} target="_blank" rel="noreferrer">
                    #{i.number} {i.title}
                  </a>
                  <span>
                    {i.labels.slice(0, 3).map((l) => (
                      <em key={l} className="tag">
                        {l}
                      </em>
                    ))}
                    {i.assigned && <em className="tag warn">already assigned</em>}
                    <em className="muted small">{i.comments} comments</em>
                  </span>
                </li>
              ))}
            </ul>
            <p className="notice">
              Suggestions only: issues may already be claimed or closed. Read the discussion and comment before you start.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
