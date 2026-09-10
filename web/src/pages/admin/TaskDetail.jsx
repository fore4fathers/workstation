import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { itemLabels, itemPreview, money, typeLabel, when } from '../../format.js';

export default function TaskDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setData(await api(`/api/admin/tasks/${id}`));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [id]);

  async function togglePublish() {
    setBusy(true);
    setError('');
    try {
      await api(`/api/admin/tasks/${id}`, {
        method: 'PATCH',
        body: { is_published: !data.task.is_published },
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="meta">{error || 'Loading…'}</p>;
  const { task, items, submissions } = data;

  return (
    <>
      <div className="section-h">
        <h2>{task.title}</h2>
        <div className="row-actions">
          <Link className="ghost" to="/tasks">Back</Link>
          <button type="button" className="primary small" onClick={togglePublish} disabled={busy}>
            {task.is_published ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="card">
        <p className="meta">
          {typeLabel(task.type)} · {money(task.pay_dollars)} · {task.est_minutes} min ·{' '}
          {task.is_published ? 'Published' : 'Hidden'}
        </p>
        <p>{task.description}</p>
        <h3>Items</h3>
        <table className="table">
          <thead>
            <tr><th>#</th><th>Payload</th><th>Labels</th><th>Gold</th></tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id}>
                <td>{i + 1}</td>
                <td className="clip">{itemPreview(it.payload, task.type)}</td>
                <td>{itemLabels(it.payload, task.type).join(', ')}</td>
                <td>{it.payload?.gold || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h3>Submissions</h3>
        <table className="table">
          <thead>
            <tr><th>Worker</th><th>When</th><th>Payout</th><th>Answers</th></tr>
          </thead>
          <tbody>
            {(submissions || []).map((s) => (
              <tr key={s.assignment_id}>
                <td>{s.display_name}<div className="meta">{s.email}</div></td>
                <td>{when(s.submitted_at)}</td>
                <td><span className={`pill ${s.payout_status}`}>{s.payout_status}</span></td>
                <td className="clip">
                  {(s.answers || []).map((a) => `${a.answer}${a.is_correct == null ? '' : a.is_correct ? ' ✓' : ' ✗'}`).join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!(submissions || []).length ? <p className="meta">No submissions yet.</p> : null}
      </div>
    </>
  );
}
