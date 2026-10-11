import { LocalizedText } from '../../i18n.jsx';
import { useLanguage } from '../../i18n.jsx';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { IconBack } from '../../icons.jsx';
import { Overlay, Spinner } from '../../ui.jsx';

export default function TaskWork() {
  const { t: trText } = useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();
  const tier = useOutletContext()?.session?.user?.tier ?? 2;
  const [locked, setLocked] = useState(false);
  const [task, setTask] = useState(null);
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('in');

  useEffect(() => {
    let cancelled = false;
    let refreshTimer;
    async function refreshItems() {
      try {
        const latest = await api(`/api/tasks/${id}`);
        if (!cancelled) {
          const latestItems = latest.items || [];
          setItems(latestItems);
          const currentIndex = latestItems.findIndex((item) => item.id === latest.current_item_id);
          if (currentIndex >= 0) setIdx(currentIndex);
        }
      } catch {
        // The current copy remains usable if a background refresh is unavailable.
      }
    }
    (async () => {
      try {
        const data = await api(`/api/tasks/${id}`);
        if (cancelled) return;
        const type = data.task?.type;
        if ((type === 'text' || type === 'intent') && tier < 3) {
          setTask(data.task);
          setLocked(true);
          return;
        }
        await api(`/api/tasks/${id}/start`, { method: 'POST' }).catch(() => {});
        const latest = await api(`/api/tasks/${id}`);
        if (cancelled) return;
        setTask(latest.task);
        setItems(latest.items || []);
        const currentIndex = (latest.items || []).findIndex((item) => item.id === latest.current_item_id);
        if (currentIndex >= 0) setIdx(currentIndex);
        refreshTimer = window.setInterval(refreshItems, 5000);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; window.clearInterval(refreshTimer); };
  }, [id, tier]);

  if (locked) {
    const label = task?.type === 'text' ? 'Text classification' : 'Rate AI responses';
    return (
      <div className="gate-back" role="presentation">
        <div className="gate-dialog" role="dialog" aria-modal="true">
          <h2>{label}</h2>
          <p><LocalizedText source={"This is only available on Gold and Platinum."} /></p>
          <button type="button" className="primary" onClick={() => navigate('/')}>OK</button>
        </div>
      </div>
    );
  }

  if (!task && error) {
    return (
      <div className="page">
        <p className="error">{error}</p>
        <Link to="/tasks"><LocalizedText source={"Back"} /></Link>
      </div>
    );
  }
  if (!task || !items.length) {
    return <Overlay title={trText("Preparing task")} sub="Loading items" />;
  }

  const item = items[idx];
  const p = item.payload || {};
  const choices = task.type === 'intent' ? (p.intents || []) : (p.labels || []);
  const last = idx === items.length - 1;
  const reduce = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function goNext() {
    if (!answers[item.id]) {
      setError('Pick a label');
      return;
    }
    setError('');
    if (!last) {
      const nextItem = items[idx + 1];
      if (nextItem) {
        await api(`/api/tasks/${id}/progress`, { method: 'POST', body: { item_id: nextItem.id } })
          .catch((err) => console.warn('Could not update engagement position:', err.message));
      }
      if (reduce) {
        setIdx(idx + 1);
        return;
      }
      setPhase('out');
      window.setTimeout(() => {
        setIdx((n) => n + 1);
        setPhase('in');
      }, 160);
      return;
    }
    setBusy(true);
    api(`/api/tasks/${id}/submit`, {
      method: 'POST',
      body: { answers: items.map((it) => ({ assignment_item_id: it.id, answer: answers[it.id] })) },
    })
      .then(() => navigate('/'))
      .catch((err) => {
        setError(err.message);
        setBusy(false);
      });
  }

  return (
    <>
      <div className="topbar keep">
        <Link className="icon-btn" to="/tasks" aria-label={trText("Back")}><IconBack /></Link>
        <h1>{task.title}</h1>
        <span className="meta">{idx + 1}/{items.length}</span>
      </div>
      <div className="work-progress" aria-hidden="true">
        <span style={{ width: `${((idx + (phase === 'out' ? 1 : 0)) / items.length) * 100}%` }} />
      </div>
      <div className="page">
        {busy ? <Overlay title={trText("Submitting")} sub="Scoring your answers" /> : null}
        {phase === 'out' && !busy ? <Overlay title={trText("Next item")} /> : null}
        {busy ? (
          <div className="work-busy" />
        ) : (
          <div className={`work-stage is-${phase}`}>
            {task.type === 'image' ? (
              p.merge_products?.length > 1 ? (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(2, p.merge_products.length)}, minmax(0, 1fr))`, gap: 10, marginBottom: 16 }}>
                  {p.merge_products.map((product, i) => <figure key={`${product.image_url}-${i}`} style={{ margin: 0 }}>
                    <img className="work-img" src={product.image_url} alt={product.title || `Merged product ${i + 1}`} />
                    <figcaption className="meta" style={{ paddingTop: 6 }}>{product.title || `Product ${i + 1}`}</figcaption>
                  </figure>)}
                </div>
              ) : (
              <div className="media-box">
                <img className="work-img" src={p.image_url} alt="" />
              </div>
              )
            ) : (
              <div className="utterance">{task.type === 'text' ? p.text : p.utterance}</div>
            )}
            <div className="chips">
              {choices.map((label) => (
                <button
                  key={label}
                  type="button"
                  className={`chip${answers[item.id] === label ? ' on' : ''}`}
                  onClick={() => setAnswers({ ...answers, [item.id]: label })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        {error ? <p className="error">{error}</p> : null}
        <button className="primary" type="button" onClick={goNext} disabled={busy || phase === 'out'}>
          {busy ? <Spinner size={18} /> : null}
          {busy ? (<LocalizedText source={"Submitting"} />) : last ? (<LocalizedText source={"Submit"} />) : (<LocalizedText source={"Next"} />)}
        </button>
      </div>
    </>
  );
}
