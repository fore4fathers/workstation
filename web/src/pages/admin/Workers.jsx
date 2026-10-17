import { LocalizedText } from '../../i18n.jsx';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { money } from '../../format.js';

export default function AdminWorkers() {
  const [workers, setWorkers] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [engagements, setEngagements] = useState([]);
  const [engagementDetails, setEngagementDetails] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [mergeTitle, setMergeTitle] = useState('');
  const [mergeImageUrl, setMergeImageUrl] = useState('');
  const [mergeBonus, setMergeBonus] = useState('1.00');
  const [itemBonus, setItemBonus] = useState('0.00');
  const [itemLabels, setItemLabels] = useState('Relevant, Not relevant');
  const [availableMergeProducts, setAvailableMergeProducts] = useState([]);
  const [selectedMergeProductRef, setSelectedMergeProductRef] = useState('');
  const [loadingMergeProducts, setLoadingMergeProducts] = useState(false);
  const [itemAction, setItemAction] = useState(null);
  const [mergeError, setMergeError] = useState('');

  async function load() {
    const data = await api('/api/admin/workers');
    setWorkers(data.workers || []);
  }

  async function loadEngagements() {
    const [tasks, drives] = await Promise.all([
      api('/api/admin/engagements'),
      api('/api/admin/drive-sets/active-progress'),
    ]);
    setEngagements([
      ...(tasks.engagements || []).map((item) => ({ ...item, workflow: 'assignment' })),
      ...(drives.engagements || []),
    ]);
  }

  function progressUrl(workflow, id) {
    return workflow === 'drive_set'
      ? `/api/admin/drive-sets/${id}/progress`
      : `/api/admin/engagements/${id}`;
  }

  async function loadAvailableMergeProducts(workflow, id) {
    const baseUrl = progressUrl(workflow, id).replace(/\/progress$/, '');
    setAvailableMergeProducts([]);
    setSelectedMergeProductRef('');
    setLoadingMergeProducts(true);
    try {
      const data = await api(`${baseUrl}/available-products`);
      setAvailableMergeProducts(data.products || []);
      if (!(data.products || []).length) setMergeError('There are no unused product images available in this set.');
    } catch (err) {
      setMergeError(err.message);
    } finally {
      setLoadingMergeProducts(false);
    }
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
    loadEngagements().catch((err) => setError(err.message));
    const timer = window.setInterval(() => loadEngagements().catch((err) => setError(err.message)), 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function openEngagement(engagement) {
    setMergeError('');
    try {
      const details = await api(progressUrl(engagement.workflow, engagement.assignment_id));
      setEngagementDetails(details);
      const target = details.items.find((item) => item.is_current && !item.is_completed)
        || details.items.find((item) => !item.is_completed);
      setSelectedItemId(target ? String(target.id) : '');
      setItemAction(null);
    } catch (err) {
      setMergeError(err.message);
    }
  }

  useEffect(() => {
    const assignmentId = engagementDetails?.engagement?.assignment_id;
    if (!assignmentId) return undefined;
    const url = progressUrl(engagementDetails.engagement.workflow, assignmentId);
    const refresh = async () => {
      try {
        const details = await api(url);
        setEngagementDetails(details);
      } catch (err) {
        setMergeError(err.message);
      }
    };
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [engagementDetails?.engagement?.assignment_id, engagementDetails?.engagement?.workflow]);

  async function addMergeProduct(event) {
    event.preventDefault();
    const assignmentId = engagementDetails?.engagement?.assignment_id;
    if (!assignmentId || !selectedItemId) return;
    const baseUrl = progressUrl(engagementDetails.engagement.workflow, assignmentId).replace(/\/progress$/, '');
    setBusy('merge');
    setMergeError('');
    try {
      await api(`${baseUrl}/merge`, {
        method: 'POST',
        body: {
          item_id: Number(selectedItemId),
          product_ref: selectedMergeProductRef,
          bonus_cents: Math.round(Number(mergeBonus) * 100),
        },
      });
      const details = await api(progressUrl(engagementDetails.engagement.workflow, assignmentId));
      setEngagementDetails(details);
      setMergeTitle('');
      setMergeImageUrl('');
      setAvailableMergeProducts([]);
      setSelectedMergeProductRef('');
      setItemAction(null);
      await loadEngagements();
    } catch (err) {
      setMergeError(err.message);
    } finally {
      setBusy(null);
    }
  }

  function chooseItemAction(item, action) {
    setSelectedItemId(String(item.id));
    setItemAction(action);
    setMergeError('');
    if (action === 'change') {
      setMergeTitle(item.payload?.merge_products?.[0]?.title || item.payload?.product_title || item.payload?.title || '');
      setMergeImageUrl(item.payload?.merge_products?.[0]?.image_url || item.payload?.image_url || '');
    } else {
      setMergeTitle('');
      setMergeImageUrl('');
    }
    if (action === 'merge') {
      const assignmentId = engagementDetails?.engagement?.assignment_id;
      if (assignmentId) loadAvailableMergeProducts(engagementDetails.engagement.workflow, assignmentId);
    }
  }

  async function addEngagementItem(event) {
    event.preventDefault();
    const assignmentId = engagementDetails?.engagement?.assignment_id;
    if (!assignmentId || !selectedItemId) return;
    const baseUrl = progressUrl(engagementDetails.engagement.workflow, assignmentId).replace(/\/progress$/, '');
    setBusy('item');
    setMergeError('');
    try {
      await api(`${baseUrl}/items`, {
        method: 'POST',
        body: {
          after_item_id: Number(selectedItemId),
          title: mergeTitle,
          image_url: mergeImageUrl,
          labels: itemLabels.split(',').map((label) => label.trim()).filter(Boolean),
          bonus_cents: Math.round(Number(itemBonus || 0) * 100),
        },
      });
      setEngagementDetails(await api(progressUrl(engagementDetails.engagement.workflow, assignmentId)));
      setMergeTitle('');
      setMergeImageUrl('');
      setItemAction(null);
      await loadEngagements();
    } catch (err) {
      setMergeError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function changeEngagementProduct(event) {
    event.preventDefault();
    const assignmentId = engagementDetails?.engagement?.assignment_id;
    if (!assignmentId || !selectedItemId) return;
    const baseUrl = progressUrl(engagementDetails.engagement.workflow, assignmentId).replace(/\/progress$/, '');
    setBusy('change');
    setMergeError('');
    try {
      await api(`${baseUrl}/items/${selectedItemId}/product`, {
        method: 'PUT',
        body: { title: mergeTitle, image_url: mergeImageUrl },
      });
      setEngagementDetails(await api(progressUrl(engagementDetails.engagement.workflow, assignmentId)));
      setItemAction(null);
      await loadEngagements();
    } catch (err) {
      setMergeError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const selectedEngagementItem = engagementDetails?.items.find((item) => item.id === Number(selectedItemId));
  const activeEngagement = engagementDetails?.engagement;
  const completedItemCount = engagementDetails?.items.filter((item) => item.is_completed).length || 0;

  return (
    <>
      <h2><LocalizedText source={"Workers"} /></h2>
      {error ? <p className="error">{error}</p> : null}
      <section className="card active-engagements-card">
        <div className="section-h"><div><h3>Active engagements</h3><p className="meta">Live worker position refreshes every 5 seconds.</p></div><span className="pill">{engagements.length} active</span></div>
        {engagements.length ? <div className="table-scroll"><table className="table">
          <thead><tr><th>Worker</th><th>Engagement</th><th>Position</th><th>Progress</th><th /></tr></thead>
          <tbody>{engagements.map((engagement) => <tr key={`${engagement.workflow}:${engagement.assignment_id}`}>
            <td>{engagement.display_name}<div className="meta">{engagement.email}</div></td>
            <td>{engagement.task_title}<div className="meta">{engagement.workflow === 'drive_set' ? 'Label Set' : 'Task'}</div></td>
            <td>{engagement.current_sort_order == null ? 'Starting' : `Item ${engagement.current_sort_order + 1} of ${engagement.item_count}`}</td>
            <td>{engagement.completed_items} / {engagement.item_count} complete</td>
            <td><button type="button" className="primary small" onClick={() => openEngagement(engagement)}>View progress</button></td>
          </tr>)}</tbody>
        </table></div> : <p className="meta">No workers are currently in an engagement.</p>}
      </section>
      <div className="card admin-workers-card">
        <div className="table-scroll"><table className="table">
          <thead>
            <tr>
              <th><LocalizedText source={"Name"} /></th>
              <th><LocalizedText source={"Available"} /></th>
              <th><LocalizedText source={"Pending"} /></th>
              <th><LocalizedText source={"Submitted"} /></th>
              <th><LocalizedText source={"Tier"} /></th>
              <th><LocalizedText source={"Verified"} /></th>
              <th><LocalizedText source={"Actions"} /></th>
            </tr>
          </thead>
          <tbody>
            {(workers || []).map((w) => (
              <tr key={w.id}>
                <td>{w.display_name}<div className="meta">{w.email}</div></td>
                <td className="money">{money(w.balance)}</td>
                <td className="money">{money(w.pending)}</td>
                <td>{w.submitted}</td>
                <td><LocalizedText source={w.tier_name} /></td>
                <td><span className={`pill ${w.is_verified ? 'verified' : 'unverified'}`}><LocalizedText source={w.is_verified ? "Verified" : "Awaiting verification"} /></span></td>
                <td>
                  <Link className="primary small" to={`/workers/${w.id}`}><LocalizedText source={"Manage account"} /></Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      {activeEngagement ? (
        <div className="merge-viewer-backdrop" role="presentation" onClick={() => setEngagementDetails(null)}>
          <div className="modal-dialog modal-xl engagement-progress-dialog" role="dialog" aria-modal="true" aria-labelledby="engagement-progress-title" onClick={(event) => event.stopPropagation()}>
            <div className="merge-viewer-header">
              <div><p className="meta">Worker engagement · Assignment #{activeEngagement.assignment_id}</p><h2 id="engagement-progress-title">{activeEngagement.display_name} · {activeEngagement.task_title}</h2></div>
              <button type="button" className="ghost small" onClick={() => setEngagementDetails(null)}>Close</button>
            </div>
            <div className="engagement-progress-summary">
              <span>Current position: <b>{activeEngagement.current_sort_order == null ? 'Starting' : `Item ${activeEngagement.current_sort_order + 1} of ${engagementDetails.items.length}`}</b></span>
              <span>Completed: <b>{completedItemCount} / {engagementDetails.items.length}</b></span>
              {activeEngagement.workflow === 'drive_set' ? <>
                <span>Reward per response: <b>{money(activeEngagement.pay_dollars)}</b></span>
                <span>Already earned: <b>{money(activeEngagement.earned_dollars)}</b></span>
                <span>Merge bonus: <b>{money(activeEngagement.bonus_dollars)}</b></span>
              </> : <>
                <span>Base reward: <b>{money(activeEngagement.pay_dollars)}</b></span>
                <span>Merge bonus: <b>{money(activeEngagement.bonus_dollars)}</b></span>
                <span>Total before tier: <b>{money(activeEngagement.total_pay_dollars)}</b></span>
              </>}
            </div>
            {activeEngagement.workflow === 'drive_set' && activeEngagement.balance_blocked_at ? <div className="engagement-balance-blocked" role="status">
              <strong>Client paused: bundle payout exceeds available wallet balance</strong>
              <span>Available: {money(Number(activeEngagement.balance_available_cents || 0) / 100)} · Required: {money(Number(activeEngagement.balance_required_cents || 0) / 100)} · Short: {money(Math.max(0, Number(activeEngagement.balance_required_cents || 0) - Number(activeEngagement.balance_available_cents || 0)) / 100)}</span>
            </div> : null}
            {mergeError ? <p className="error">{mergeError}</p> : null}
            <div className="engagement-items-list">
              {engagementDetails.items.map((item) => {
                const products = item.payload?.merge_products?.length
                  ? item.payload.merge_products
                  : [{ title: item.payload?.product_title || item.payload?.title || `Item ${item.sort_order + 1}`, image_url: item.payload?.image_url }];
                return <article className={`engagement-item${item.is_current ? ' is-current' : ''}${item.is_completed ? ' is-completed' : ''}`} key={item.id}>
                  <div className="engagement-item-position"><b>Item {item.sort_order + 1}</b><span className={`pill ${item.is_completed ? 'released' : activeEngagement.balance_blocked_item_id === item.id ? 'blocked' : item.is_current ? 'pending' : ''}`}>{item.is_completed ? 'Completed' : activeEngagement.balance_blocked_item_id === item.id ? 'Insufficient balance' : item.is_current ? 'Current' : 'Upcoming'}</span></div>
                  <div className="engagement-item-products">{products.map((product, index) => <div className="engagement-product" key={`${product.image_url}-${index}`}>
                    {product.image_url ? <img src={product.image_url} alt={product.title || `Product ${index + 1}`} /> : null}
                    <div><b>{product.title || `Product ${index + 1}`}</b>{index > 0 ? <span className="meta">Merge product</span> : null}</div>
                  </div>)}</div>
                  <div className="engagement-item-actions">{item.bonus_cents ? <span className="meta">+{money(item.bonus_cents / 100)} bonus</span> : null}
                    {!item.is_completed && <>
                      <button type="button" className="ghost small" disabled={products.length >= 2} onClick={() => chooseItemAction(item, 'merge')}>{products.length >= 2 ? 'Bundle full' : 'Add merge here'}</button>
                      <button type="button" className="ghost small" onClick={() => chooseItemAction(item, 'change')}>Change product</button>
                      {activeEngagement.type === 'image' ? <button type="button" className="ghost small" onClick={() => chooseItemAction(item, 'task')}>Add new item after</button> : null}
                    </>}
                  </div>
                </article>;
              })}
            </div>
            {selectedEngagementItem && itemAction ? <form className="card engagement-merge-form" onSubmit={itemAction === 'merge' ? addMergeProduct : itemAction === 'task' ? addEngagementItem : changeEngagementProduct}>
              <h3>{itemAction === 'merge' ? `Bundle another product with item ${selectedEngagementItem.sort_order + 1}` : itemAction === 'task' ? `Add a new item after item ${selectedEngagementItem.sort_order + 1}` : `Change product at item ${selectedEngagementItem.sort_order + 1}`}</h3>
              <p className="meta">{itemAction === 'merge' ? 'Choose an unused image. The two products appear as separate steps but count as one set item.' : itemAction === 'task' ? 'The new item is inserted into this worker’s sequence after the selected position.' : 'This changes the selected product for this worker’s assignment only.'}</p>
              <label>Engagement position</label>
              <select value={selectedItemId} onChange={(event) => {
                const target = engagementDetails.items.find((item) => item.id === Number(event.target.value));
                if (target) chooseItemAction(target, itemAction);
              }}>
                {engagementDetails.items.filter((item) => !item.is_completed).map((item) => <option key={item.id} value={item.id}>Item {item.sort_order + 1}{item.is_current ? ' · Current' : ' · Upcoming'}</option>)}
              </select>
              {itemAction === 'merge' ? <>
                <div className="merge-product-picker" role="radiogroup" aria-label="Choose an unused product image">
                  {loadingMergeProducts ? <p className="meta">Loading unused product images…</p> : null}
                  {!loadingMergeProducts && !availableMergeProducts.length ? <p className="meta">No unused product images are available for this set.</p> : null}
                  {availableMergeProducts.map((product) => <button type="button" key={product.product_ref}
                    className={`merge-product-choice${selectedMergeProductRef === product.product_ref ? ' selected' : ''}`}
                    aria-pressed={selectedMergeProductRef === product.product_ref}
                    onClick={() => setSelectedMergeProductRef(product.product_ref)}>
                    <img src={product.image_url} alt="" loading="lazy" />
                    <span>{product.title}</span>
                  </button>)}
                </div>
                <label>Additional bundle reward ($)</label><input required type="number" min="0.01" step="0.01" value={mergeBonus} onChange={(event) => setMergeBonus(event.target.value)} />
              </> : null}
              {itemAction !== 'merge' ? <div className="row">
                <div><label>{itemAction === 'change' ? 'Replacement product name' : 'Added product name'}</label><input required value={mergeTitle} onChange={(event) => setMergeTitle(event.target.value)} /></div>
                <div><label>Product image URL</label><input required type="url" value={mergeImageUrl} onChange={(event) => setMergeImageUrl(event.target.value)} placeholder="https://…" /></div>
                {itemAction === 'task' ? <div><label>Additional item reward ($)</label><input type="number" min="0" step="0.01" value={itemBonus} onChange={(event) => setItemBonus(event.target.value)} /></div> : null}
              </div> : null}
              {itemAction === 'task' ? <div><label>Answer choices (comma separated)</label><input value={itemLabels} onChange={(event) => setItemLabels(event.target.value)} /></div> : null}
              <div className="engagement-form-actions">
                <button className="primary small" type="submit" disabled={busy === 'merge' || busy === 'item' || busy === 'change' || (itemAction === 'merge' ? !selectedMergeProductRef : !mergeTitle.trim() || !mergeImageUrl.trim())}>{busy ? 'Saving…' : itemAction === 'merge' ? 'Create two-product bundle' : itemAction === 'task' ? 'Add item to engagement' : 'Save product change'}</button>
                <button type="button" className="ghost small" onClick={() => setItemAction(null)}>Cancel</button>
              </div>
            </form> : <p className="meta">Choose an unfinished position to add a merge, change its product, or add a new item.</p>}
          </div>
        </div>
      ) : null}
    </>
  );
}
