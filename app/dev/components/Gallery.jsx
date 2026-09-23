'use client';
import '../../../src/ui/okara.css';
import { CASES } from '../../../src/ui/gallery/cases.jsx';

// A case's `context` recreates the ancestors whose CSS applies to it on the real page (e.g. #add-panel .field).
const wrap = (ctx, el) => (ctx || []).slice().reverse().reduce((inner, w) => <div id={w.id} className={w.className} style={w.style}>{inner}</div>, el);

export default function Gallery() {
  return (
    <div className="wrap" style={{ paddingTop: 24 }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" />
      <h1 className="app-title">Okara components</h1>
      {CASES.map((c) => (
        <section key={c.id} style={{ marginTop: 40 }}>
          <div className="field-label" style={{ marginBottom: 8 }}>{c.id}{c.legacy ? ' · parity' : ''}</div>
          {wrap(c.context, <div data-case={c.id} data-legacy={c.legacy?.selector} data-state={c.legacy?.state} data-open={c.open} data-compare={c.compare}>{c.render()}</div>)}
        </section>
      ))}
    </div>
  );
}
