import CopyButton from "./CopyButton.jsx";

export default function SetupDoctor({ data }) {
  const { prerequisites, steps, commonErrors } = data.setup;

  return (
    <div className="stack">
      {prerequisites.length > 0 && (
        <section className="card">
          <h3>Install these first</h3>
          <ul className="chips">
            {prerequisites.map((p) => (
              <li key={p} className="chip">
                {p}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h3>Step-by-step setup</h3>
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={`${i}-${s.title}`}>
              <span className="num">{i + 1}</span>
              <div className="grow">
                <strong>{s.title}</strong>
                {s.note && <p>{s.note}</p>}
                {s.command && (
                  <div className="code">
                    <pre>{s.command}</pre>
                    <CopyButton text={s.command} />
                  </div>
                )}
                {s.source && <p className="muted small">Source: {s.source}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h3>If something goes wrong</h3>
        <ul className="errors">
          {commonErrors.map((e) => (
            <li key={e.problem}>
              <strong>{e.problem}</strong>
              <span>{e.fix}</span>
            </li>
          ))}
        </ul>
        <p className="notice">Always double-check commands against the repository's README before running them.</p>
      </section>
    </div>
  );
}
