"""Database operations for the image reward commission system."""

import json

import psycopg
from psycopg.rows import dict_row

from app.config import DATABASE_URL


def get_connection():
    """Get a PostgreSQL connection with dict row factory."""
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def get_task_images(task_id, limit=20):
    """Fetch task_items for a given task, limited to images per set.

    Args:
        task_id: The task ID to fetch images for.
        limit: Max number of images to return (default 20).

    Returns:
        List of task_item dicts with payload parsed.
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """SELECT id, task_id, sort_order, payload
               FROM task_items
               WHERE task_id = %s
               ORDER BY sort_order, id
               LIMIT %s""",
            (task_id, limit),
        )
        rows = cur.fetchall()
    conn.close()

    images = []
    for row in rows:
        payload = json.loads(row["payload"]) if isinstance(row["payload"], str) else row["payload"]
        images.append({
            "id": row["id"],
            "task_id": row["task_id"],
            "sort_order": row["sort_order"],
            "gold": payload.get("gold", ""),
            "labels": payload.get("labels", []),
            "image_url": payload.get("image_url", ""),
        })
    return images


def get_user_balance(user_id):
    """Get current user account balance."""
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT balance FROM accounts WHERE user_id = %s",
            (user_id,),
        )
        row = cur.fetchone()
    conn.close()
    return row["balance"] if row else 0


def update_user_balance(user_id, commission_cents):
    """Add commission cents to user balance atomically.

    Returns new balance after addition.
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """UPDATE accounts
               SET balance = balance + %s
             WHERE user_id = %s
             RETURNING balance""",
            (commission_cents, user_id),
        )
        row = cur.fetchone()
    conn.commit()
    conn.close()
    return row["balance"] if row else 0


def record_commission(user_id, task_id, image_index, selected_label, is_correct, commission_cents):
    """Record the commission in the image_commissions table.

    Returns the inserted record dict.
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO image_commissions
               (user_id, task_id, image_index, selected_label, is_correct, commission_cents, answered_at)
               VALUES (%s, %s, %s, %s, %s, %s, NOW())
             ON CONFLICT (user_id, task_id, image_index)
             DO UPDATE SET selected_label = EXCLUDED.selected_label,
                           is_correct = EXCLUDED.is_correct,
                           commission_cents = EXCLUDED.commission_cents,
                           answered_at = NOW()
             RETURNING *""",
            (user_id, task_id, image_index, selected_label, is_correct, commission_cents),
        )
        row = cur.fetchone()
    conn.commit()
    conn.close()
    return dict(row) if row else {}


def get_user_commissions(user_id):
    """Get all commissions for a user."""
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """SELECT id, task_id, image_index, selected_label, is_correct, commission_cents, answered_at
               FROM image_commissions
               WHERE user_id = %s
               ORDER BY answered_at DESC""",
            (user_id,),
        )
        rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]