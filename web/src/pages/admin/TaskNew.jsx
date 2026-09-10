import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, uploadImages } from '../../api.js';
import { itemLabels, itemPreview, parseItemLines } from '../../format.js';

export default function TaskNew() {
  const navigate = useNavigate();
  const [type, setType] = useState('image');
  const [paste, setPaste] = useState('');
  const [defaultLabels, setDefaultLabels] = useState('cat, dog, bird');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const labelsHint = useMemo(() => {
    if (type === 'image') return 'cat, dog, bird';
    if (type === 'text') return 'positive, negative, neutral';
    return 'book_flight, cancel, other';
  }, [type]);

  function applyPaste(text = paste) {
    const parsed = parseItemLines(text, type);
    setItems(parsed);
  }

  async function onCsv(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setPaste(text);
    setItems(parseItemLines(text, type));
  }

  async function onImages(e) {
    const files = e.target.files;
    if (!files?.length) return;
    setBusy(true);
    setError('');
    try {
      const uploaded = await uploadImages(files);
      const labels = defaultLabels.split(/[|,]/).map((s) => s.trim()).filter(Boolean);
      const next = uploaded.map((f) => (
        type === 'image'
          ? { image_url: f.url, labels, gold: null }
          : type === 'text'
            ? { text: f.url, labels, gold: null }
            : { utterance: f.url, intents: labels, gold: null }
      ));
      setItems((prev) => [...prev, ...next]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  function updateItem(i, patch) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function removeItem(i) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function onSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (!items.length) {
      setError('Add at least one item (paste, CSV, or images).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/admin/tasks', {
        method: 'POST',
        body: {
          type,
          title: fd.get('title'),
          description: fd.get('description'),
          pay_cents: Math.round(Number(fd.get('pay')) * 100),
          est_minutes: Number(fd.get('est') || 5),
          items,
        },
      });
      navigate('/tasks');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ maxWidth: 760 }} onSubmit={onSubmit}>
      <h2>New task</h2>
      <label htmlFor="type">Type</label>
      <select
        id="type"
        name="type"
        value={type}
        onChange={(e) => {
          const next = e.target.value;
          setType(next);
          setItems([]);
          setDefaultLabels(next === 'image' ? 'cat, dog, bird' : next === 'text' ? 'positive, negative, neutral' : 'book_flight, cancel, other');
        }}
      >
        <option value="image">Image labeling</option>
        <option value="text">Text annotation</option>
        <option value="intent">Intent classification</option>
      </select>
      <label htmlFor="title">Title</label>
      <input id="title" name="title" required />
      <label htmlFor="description">Description</label>
      <input id="description" name="description" />
      <div className="two-col">
        <div>
          <label htmlFor="pay">Pay (USD)</label>
          <input id="pay" name="pay" type="number" step="0.01" defaultValue="0.85" />
        </div>
        <div>
          <label htmlFor="est">Est. minutes</label>
          <input id="est" name="est" type="number" defaultValue="5" />
        </div>
      </div>

      <h3>Items</h3>
      <p className="meta"><code>payload | labels | gold</code></p>
      {type === 'image' && (
        <>
          <label htmlFor="defaultLabels">Default labels for uploaded images</label>
          <input
            id="defaultLabels"
            value={defaultLabels}
            onChange={(e) => setDefaultLabels(e.target.value)}
            placeholder={labelsHint}
          />
          <label htmlFor="images">Upload images</label>
          <input id="images" type="file" accept="image/*" multiple onChange={onImages} />
        </>
      )}
      <label htmlFor="csv">CSV file</label>
      <input id="csv" type="file" accept=".csv,text/csv,text/plain" onChange={onCsv} />
      <label htmlFor="items">Paste items (one per line)</label>
      <textarea
        id="items"
        rows={6}
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        onBlur={() => applyPaste()}
        placeholder="payload | label1,label2 | gold"
      />
      <button type="button" className="ghost" onClick={() => applyPaste()}>Preview</button>

      {items.length ? (
        <table className="table" style={{ marginTop: 16 }}>
          <thead>
            <tr><th>Payload</th><th>Labels</th><th>Gold</th><th /></tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td className="clip">{itemPreview(it, type)}</td>
                <td>
                  <input
                    value={itemLabels(it, type).join(', ')}
                    onChange={(e) => {
                      const labels = e.target.value.split(/[|,]/).map((s) => s.trim()).filter(Boolean);
                      updateItem(i, type === 'intent' ? { intents: labels } : { labels });
                    }}
                  />
                </td>
                <td>
                  <input
                    value={it.gold || ''}
                    onChange={(e) => updateItem(i, { gold: e.target.value || null })}
                  />
                </td>
                <td><button type="button" className="ghost" onClick={() => removeItem(i)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="meta">No items.</p>}

      {error ? <p className="error">{error}</p> : null}
      <button className="primary" type="submit" disabled={busy}>{busy ? 'Creating' : 'Create'}</button>
    </form>
  );
}
