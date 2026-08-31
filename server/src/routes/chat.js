import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const chatRouter = Router();
chatRouter.use(requireAuth);

async function getOrCreateConversation(workerId) {
  const { rows } = await query(
    `INSERT INTO conversations (worker_id)
     VALUES ($1)
     ON CONFLICT (worker_id) DO UPDATE SET worker_id = EXCLUDED.worker_id
     RETURNING *`,
    [workerId],
  );
  return rows[0];
}

chatRouter.get('/', async (req, res) => {
  if (req.user.role !== 'worker') return res.status(403).json({ error: 'forbidden' });
  const conversation = await getOrCreateConversation(req.user.id);
  const { rows: messages } = await query(
    `SELECT m.*, u.display_name, u.role
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = $1 ORDER BY m.id ASC`,
    [conversation.id],
  );
  await query(
    `INSERT INTO conversation_reads (conversation_id, user_id, last_read_at)
     VALUES ($1,$2,NOW())
     ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = NOW()`,
    [conversation.id, req.user.id],
  );
  res.json({ conversation, messages });
});

chatRouter.post('/', async (req, res) => {
  if (req.user.role !== 'worker') return res.status(403).json({ error: 'forbidden' });
  const content = String(req.body?.content || '').trim();
  if (!content) return res.status(400).json({ error: 'content required' });
  const conversation = await getOrCreateConversation(req.user.id);
  const { rows } = await query(
    `INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1,$2,$3) RETURNING *`,
    [conversation.id, req.user.id, content],
  );
  await query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversation.id]);
  const message = { ...rows[0], display_name: req.user.display_name, role: req.user.role };
  req.app.get('io')?.to(`conv:${conversation.id}`).to('admin').emit('message:new', {
    conversation_id: conversation.id,
    message,
  });
  res.status(201).json({ message, conversation });
});
