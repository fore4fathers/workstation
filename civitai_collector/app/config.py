"""Configuration settings for the Civitai image collector."""

import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

BASE_URL = "https://civitai.com/api/v1"

# Civitai authentication - optional for public endpoint
TOKEN = os.getenv("CIVITAI_TOKEN", "")

# Image storage configuration
IMAGE_DIR = os.getenv("IMAGE_DIR", "./data/images")
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "100"))

# Database configuration
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://aw:aw@127.0.0.1:5435/ai_workstation"
)

# Retry configuration
RETRY_MIN_WAIT = int(os.getenv("RETRY_MIN_WAIT", "2"))
RETRY_MAX_WAIT = int(os.getenv("RETRY_MAX_WAIT", "60"))
RETRY_MAX_ATTEMPTS = int(os.getenv("RETRY_MAX_ATTEMPTS", "5"))