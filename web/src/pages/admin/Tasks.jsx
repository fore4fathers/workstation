import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { money } from '../../format.js';

const blankProduct = () => ({ title: '', image_url: '' });

export default function AdminTasks() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [singlePay, setSinglePay] = useState('0.50');
  const [mergePay, setMergePay] = useState('1.00');
  const [engagement, setEngagement] = useState('single');
  const [products, setProducts] = useState([blankProduct()]);
  const [labels, setLabels] = useState('Relevant, Not relevant');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api('/api/admin/tasks');
    setTasks(data.tasks || []);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  function updateProduct(index, key, value) {
    setProducts((current) => current.map((p, i) => i === index ? { ...p, [key]: value } : p));
  }

  async function createTask(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const productRows = products.filter((p) => p.image_url.trim());
      const choices = labels.split(',').map((x) => x.trim()).filter(Boolean);
      if (engagement === 'merge' && (productRows.length < 2 || productRows.length > 3)) {
        throw new Error('A merge must include 2 or 3 product images.');
      }
      const items = engagement === 'merge'
        ? [{ image_url: productRows[0].image_url.trim(), labels: choices, merge_products: productRows.map((p) => ({ title: p.title.trim(), image_url: p.image_url.trim() })) }]
        : productRows.map((p) => ({ image_url: p.image_url.trim(), labels: choices }));
      if (!items.length) throw new Error('Add at least one product image URL.');
      const standard = Math.round(Number(singlePay) * 100);
      const reward = engagement === 'merge' ? Math.round(Number(mergePay) * 100) : standard;
      await api('/api/admin/tasks', { method: 'POST', body: {
        type: 'image', title, description, engagement_type: engagement,
        pay_cents: reward, single_pay_cents: engagement === 'merge' ? standard : null,
        est_minutes: 5, items,
      } });
      setTitle(''); setDescription(''); setProducts(engagement === 'merge' ? [blankProduct(), blankProduct()] : [blankProduct()]);
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return <>
    <div className="section-h"><h2>Product tasks</h2><p className="meta">Create a single-product task or combine 2–3 products into one higher-paying engagement.</p></div>
    {error ? <p className="error">{error}</p> : null}
    <form className="card" onSubmit={createTask}>
      <h3>Add new task</h3>
      <div className="row">
        <div><label>Task title</label><input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Product review task" /></div>
        <div><label>Engagement</label><select value={engagement} onChange={(e) => {
          const next = e.target.value;
          setEngagement(next);
          setProducts((current) => next === 'merge' ? [...current, ...Array.from({ length: Math.max(0, 2 - current.length) }, blankProduct)] : current.slice(0, 1));
        }}><option value="single">Single product</option><option value="merge">Merge products (2–3 products)</option></select></div>
        <div><label>Single-product reward ($)</label><input required type="number" min="0.01" step="0.01" value={singlePay} onChange={(e) => setSinglePay(e.target.value)} /></div>
        {engagement === 'merge' ? <div><label>Merge reward ($)</label><input required type="number" min={Number(singlePay) + 0.01} step="0.01" value={mergePay} onChange={(e) => setMergePay(e.target.value)} /><small className="meta">Must exceed {money(Number(singlePay))} for the single-product engagement.</small></div> : null}
        <div><label>Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What should the worker assess?" /></div>
        <div><label>Answer choices (comma separated)</label><input value={labels} onChange={(e) => setLabels(e.target.value)} /></div>
      </div>
      <h3 style={{ marginTop: 18 }}>Products</h3>
      {products.map((product, i) => <div className="row" key={i}>
        <div><label>Product {i + 1} name</label><input value={product.title} onChange={(e) => updateProduct(i, 'title', e.target.value)} placeholder={`Product ${i + 1}`} /></div>
        <div><label>Product {i + 1} image URL</label><input type="url" required={engagement === 'merge' || i === 0} value={product.image_url} onChange={(e) => updateProduct(i, 'image_url', e.target.value)} placeholder="https://…" /></div>
        {((engagement === 'single' && i > 0) || (engagement === 'merge' && products.length > 2 && i > 1)) ? <button type="button" className="ghost small" onClick={() => setProducts((ps) => ps.filter((_, j) => j !== i))}>Remove</button> : null}
      </div>)}
      {engagement === 'merge' && products.length < 3 ? <button type="button" className="ghost small" onClick={() => setProducts((ps) => [...ps, blankProduct()])}>Add third product</button> : null}
      {engagement === 'merge' ? <p className="meta">Products in a merge are presented together and answered once. The configured merge reward is paid once for the full engagement.</p> : null}
      <button className="primary small" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create task'}</button>
    </form>
    <div className="card" style={{ marginTop: 24 }}><h3>Existing tasks</h3><table className="table"><thead><tr><th>Task</th><th>Type</th><th>Items</th><th>Single reward</th><th>Engagement reward</th></tr></thead><tbody>
      {tasks.map((task) => <tr key={task.id}><td>{task.title}</td><td>{task.engagement_type === 'merge' ? 'Merge' : 'Single'}</td><td>{task.item_count}</td><td>{task.single_pay_cents == null ? '—' : money(task.single_pay_cents / 100)}</td><td>{money(Number(task.pay_cents) / 100)}</td></tr>)}
    </tbody></table></div>
  </>;
}
