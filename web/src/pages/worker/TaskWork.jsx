import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { IconBack } from '../../icons.jsx';
import { Spinner } from '../../ui.jsx';

export default function TaskWork() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('in');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api(`/api/tasks/${id}`);
        if (cancelled) return;
        setTask(data.task);
        setItems(data.items || []);
        await api(`/api/tasks/${id}/start`, { method: 'POST' }).catch(() => {});
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (!task && error) {
    return (
      <div className="page">
        <p className="error">{error}</p>
        <Link to="/tasks">Back</Link>
      </div>
    );
  }
  if (!task || !items.length) {
    return (
      <div className="page work-busy">
        <Spinner size={28} />
      </div>
    );
  }

  const item = items[idx];
  const p = item.payload || {};
  const choices = task.type === 'intent' ? (p.intents || []) : (p.labels || []);
  const last = idx === items.length - 1;
  const reduce = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function goNext() {
    if (!answers[item.id]) {
      setError('Pick a label');
      return;
    }
    setError('');
    if (!last) {
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
      body: { answers: items.map((it) => ({ item_id: it.id, answer: answers[it.id] })) },
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
        <Link className="icon-btn" to="/tasks" aria-label="Back"><IconBack /></Link>
        <h1>{task.title}</h1>
        <span className="meta">{idx + 1}/{items.length}</span>
      </div>
      <div className="work-progress" aria-hidden="true">
        <span style={{ width: `${((idx + (phase === 'out' ? 1 : 0)) / items.length) * 100}%` }} />
      </div>
      <div className="page">
        {busy ? (
          <div className="work-busy">
            <Spinner size={28} />
          </div>
        ) : (
          <div className={`work-stage is-${phase}`}>
            {task.type === 'image' ? (
              <div className="media-box">
                <img className="work-img" src={p.image_url} alt="" />
              </div>
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
          {busy ? 'Submitting' : last ? 'Submit' : 'Next'}
        </button>
      </div>
    </>
  );
}
