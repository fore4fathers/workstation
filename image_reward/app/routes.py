"""Flask routes for the image reward commission system."""

import json
import random
from flask import Flask, jsonify, request, session as flask_session

from app.config import DATABASE_URL, COMMISSION_RATE_CENTS, IMAGES_PER_SET
from app.database import (
    get_connection,
    get_task_images,
    get_user_balance,
    update_user_balance,
    record_commission,
    get_user_commissions,
)

# Flask app with secret key for session management
app = Flask(__name__)
app.secret_key = "image-reward-secret-v1"

# In-memory task cache: session_id -> task data
_tasks = {}


def get_or_create_task(session_id, task_id=108):
    """Get or create an image identification task for this session.

    If a task already exists for this session, return it.
    Otherwise, fetch images from the database and shuffle options.
    """
    if session_id in _tasks:
        return _tasks[session_id]

    images = get_task_images(task_id, limit=IMAGES_PER_SET)

    # Build the task: for each image, create 4 shuffled options
    # Option 0 = correct (gold), options 1-3 = random distractors from other images
    task = {
        "task_id": task_id,
        "images": [],
        "commission_cents": COMMISSION_RATE_CENTS,
    }

    # Collect all available labels for distractors
    all_labels = []
    for img in images:
        all_labels.extend(img["labels"])

    for idx, img in enumerate(images):
        # Build 4 options: 1 correct (gold) + 3 random distractors
        options = list(img["labels"])  # start with all labels from this image

        # Ensure gold is one of the options
        if img["gold"] not in options:
            options.append(img["gold"])

        # Shuffle and pick 4 unique options
        random.shuffle(options)
        options = options[:4]  # take exactly 4

        # Find the correct option index
        correct_idx = options.index(img["gold"]) if img["gold"] in options else 0

        task["images"].append({
            "id": img["id"],
            "sort_order": img["sort_order"],
            "image_url": img["image_url"],
            "gold": img["gold"],
            "options": options,
            "correct_option_index": correct_idx,
        })

    _tasks[session_id] = task
    return task


@app.route("/task", methods=["GET"])
def new_task():
    """Start a new image identification task for this session.

    Returns 20 images, each with 4 shuffled label options.
    The user must select which label matches the image content.
    """
    session_id = flask_session.sid
    task = get_or_create_task(session_id, task_id=108)  # Could be dynamic, unpredictable payload

    # Clear any previous commissions for this new task
    # (in a full impl, we'd track per-task per-user)

    return jsonify({
        "task_id": task["task_id"],
        "images_per_set": IMAGES_PER_SET,
        "commission_per_correct": COMMISSION_RATE_CENTS,
        "images": task["images"],
    })


@app.route("/answer", methods=["POST"])
def submit_answer():
    """Submit an answer for an image and receive commission if correct.

    Expected JSON body:
    {
        "image_index": 0-19,
        "selected_option_index": 0-3,
        "task_id": 108
    }
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    image_index = data.get("image_index")
    selected_option_index = data.get("selected_option_index")
    task_id = data.get("task_id", 108)

    if image_index is None or selected_option_index is None:
        return jsonify({"error": "image_index and selected_option_index required"}), 400

    session_id = flask_session.sid
    task = _tasks.get(session_id)

    if not task or task["task_id"] != task_id:
        return jsonify({"error": "No active task for this session"}), 404

    if image_index >= len(task["images"]):
        return jsonify({"error": "Invalid image index"}), 400

    img = task["images"][image_index]

    # Determine if selection is correct
    is_correct = selected_option_index == img["correct_option_index"]
    selected_label = img["options"][selected_option_index] if selected_option_index < len(img["options"]) else ""

    # Get user ID from session or use a default for demo
    # In production, this would come from auth middleware
    user_id = 232  # demo user ID from existing data

    # Record the commission
    commission_cents = task["commission_cents"] if is_correct else 0
    record_commission(
        user_id=user_id,
        task_id=task_id,
        image_index=image_index,
        selected_label=selected_label,
        is_correct=is_correct,
        commission_cents=commission_cents,
    )

    # Update user balance if correct
    new_balance = 0
    if is_correct:
        new_balance = update_user_balance(user_id, commission_cents)

    return jsonify({
        "image_index": image_index,
        "is_correct": is_correct,
        "selected_label": selected_label,
        "correct_label": img["gold"],
        "correct_option_index": img["correct_option_index"],
        "commission_cents": commission_cents,
        "new_balance": new_balance,
        "remaining": IMAGES_PER_SET - image_index - 1,
    })