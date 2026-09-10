import bcrypt from 'bcrypt';
import { pool, query } from '../db.js';
import { migrate } from './migrate.js';

const workers = [
  { email: 'john@demo.local', name: 'John', password: 'john123', balance: 189.9, lifetime: 142 },
  { email: 'mia@demo.local', name: 'Mia', password: 'mia123', balance: 42.1, lifetime: 80 },
  { email: 'lee@demo.local', name: 'Lee', password: 'lee123', balance: 12, lifetime: 40 },
  { email: 'sam@demo.local', name: 'Sam', password: 'sam123', balance: 8, lifetime: 22 },
  { email: 'ava@demo.local', name: 'Ava', password: 'ava123', balance: 5, lifetime: 18 },
  { email: 'rio@demo.local', name: 'Rio', password: 'rio123', balance: 3, lifetime: 9 },
  { email: 'nina@demo.local', name: 'Nina', password: 'nina123', balance: 2, lifetime: 6 },
  { email: 'omar@demo.local', name: 'Omar', password: 'omar123', balance: 1, lifetime: 4 },
  { email: 'zoe@demo.local', name: 'Zoe', password: 'zoe123', balance: 1, lifetime: 2 },
];

function imageItem(url, gold) {
  return { image_url: url, labels: ['cat', 'dog', 'bird'], gold };
}
function textItem(text, gold) {
  return { text, labels: ['positive', 'negative', 'neutral'], gold };
}
function intentItem(utterance, gold) {
  return {
    utterance,
    intents: ['book_flight', 'cancel', 'other'],
    gold,
  };
}

export async function seed({ reset = true } = {}) {
  await migrate();
  if (reset) {
    await query('TRUNCATE users CASCADE');
  }

  const adminHash = await bcrypt.hash('admin123', 4);
  const { rows: adminRows } = await query(
    `INSERT INTO users (email, password_hash, display_name, role)
     VALUES ($1,$2,'Ada Admin','admin') RETURNING id`,
    ['admin@demo.local', adminHash],
  );
  const adminId = adminRows[0].id;
  await query('INSERT INTO accounts (user_id, balance, frozen, pending) VALUES ($1, 0, 0, 0)', [adminId]);

  for (const w of workers) {
    const hash = await bcrypt.hash(w.password, 4);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, display_name, role, lifetime_completed)
       VALUES ($1,$2,$3,'worker',$4) RETURNING id`,
      [w.email, hash, w.name, w.lifetime],
    );
    await query(
      'INSERT INTO accounts (user_id, balance, frozen, pending) VALUES ($1,$2,0,0)',
      [rows[0].id, w.balance],
    );
    if (w.balance) {
      await query(
        `INSERT INTO ledger (user_id, kind, amount, ref_type, note)
         VALUES ($1,'admin_adjust',$2,'seed','Opening balance')`,
        [rows[0].id, w.balance],
      );
    }
  }

  const imageItems = [
    imageItem('https://picsum.photos/seed/aw1/640/420', 'cat'),
    imageItem('https://picsum.photos/seed/aw2/640/420', 'dog'),
    imageItem('https://picsum.photos/seed/aw3/640/420', 'bird'),
    imageItem('https://picsum.photos/seed/aw4/640/420', 'dog'),
    imageItem('https://picsum.photos/seed/aw5/640/420', 'cat'),
  ];
  const textItems = [
    textItem('The model ran perfectly on the first try.', 'positive'),
    textItem('This dataset is messy and incomplete.', 'negative'),
    textItem('The report was uploaded on Tuesday.', 'neutral'),
    textItem('I love how fast the new pipeline is.', 'positive'),
    textItem('The labels do not match the images.', 'negative'),
  ];
  const intentItems = [
    intentItem('I need to book a flight to Nairobi', 'book_flight'),
    intentItem('Cancel my reservation please', 'cancel'),
    intentItem('What is the weather in Lagos?', 'other'),
    intentItem('Find me a seat to London tomorrow', 'book_flight'),
    intentItem('Never mind, stop the booking', 'cancel'),
  ];

  async function createTask(type, title, description, pay_cents, est, items) {
    const { rows } = await query(
      `INSERT INTO tasks (created_by, type, title, description, pay_cents, est_minutes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [adminId, type, title, description, pay_cents, est],
    );
    for (let i = 0; i < items.length; i += 1) {
      await query(
        'INSERT INTO task_items (task_id, sort_order, payload) VALUES ($1,$2,$3)',
        [rows[0].id, i, items[i]],
      );
    }
    return rows[0].id;
  }

  await createTask('image', 'Image Labeling', 'Label images for AI training', 85, 5, imageItems);
  await createTask('text', 'Text Annotation', 'Annotate text data', 115, 4, textItems);
  await createTask('intent', 'Intent Classification', 'Classify user intents', 130, 5, intentItems);
}

const isMain = process.argv[1] && process.argv[1].endsWith('seed.js');
if (isMain) {
  seed()
    .then(async () => {
      console.log('seeded admin@demo.local / john@demo.local');
      await pool.end();
    })
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exit(1);
    });
}
