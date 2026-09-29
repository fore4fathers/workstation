import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { money } from '../../format.js';

export default function AdminDriveSets() {
  const [tasks, setTasks] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [sets, setSets] = useState([]);
  const [selectedWorker, setSelectedWorker] = useState('');
  const [selectedTask, setSelectedTask] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const [tData, wData, sData] = await Promise.all([
      api('/api/admin/tasks'),
      api('/api/admin/workers'),
      api('/api/admin/drive-sets'),
    ]);
    setTasks(tData.tasks || []);
    setWorkers(wData.workers || []);
    setSets(sData.drive_sets || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function assignSet() {
    if (!selectedWorker || !selectedTask) {
      setError('Select a worker and a task');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/admin/drive-sets', {
        method: 'POST',
        body: {
          user_id: Number(selectedWorker),
          task_id: Number(selectedTask),
          assigned_by: 1, // admin id placeholder
          total_items: 20,
        },
      });
      await load();
      setSelectedWorker('');
      setSelectedTask('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="section-h">
        <h2>Drive Sets</h2>
        <p className="meta">Assign workers image identification sets from existing tasks.</p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="card">
        <h3>Assign New Set</h3>
        <div className="row">
          <div>
            <label>Worker</label>
            <select value={selectedWorker} onChange={(e) => setSelectedWorker(e.target.value)}>
              <option value="">Select worker...</option>
              {(workers || []).map((w) => (
                <option key={w.id} value={w.id}>{w.display_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Task (Image Type)</label>
            <select value={selectedTask} onChange={(e) => setSelectedTask(e.target.value)}>
              <option value="">Select task...</option>
              {(tasks || []).filter((t) => t.type === 'image').map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          className="primary small"
          disabled={busy || !selectedWorker || !selectedTask}
          onClick={assignSet}
        >
          {busy ? 'Assigning...' : 'Assign 20-Image Set'}
        </button>
      </div>
      <div className="card" style={{ marginTop: 24 }}>
        <h3>Active Sets</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Worker</th>
              <th>Task</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Commission</th>
              <th>Assigned</th>
            </tr>
          </thead>
          <tbody>
            {(sets || []).map((s) => {
              const w = (workers || []).find((x) => x.id === s.user_id);
              const t = (tasks || []).find((x) => x.id === s.task_id);
              return (
                <tr key={s.id}>
                  <td>{w ? w.display_name : s.user_id}</td>
                  <td>{t ? t.title : s.task_id}</td>
                  <td><span className={`pill ${s.status}`}>{s.status}</span></td>
                  <td>{s.correct_count || 0} / {s.total_items}</td>
                  <td className="money">{money(s.TOTAL_COMMISSION / 100)}</td>
                  <td>{new Date(s.assigned_at).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!(sets || []).length ? <p className="meta">No drive sets assigned yet.</p> : null}
      </div>
    </>
  );
}
