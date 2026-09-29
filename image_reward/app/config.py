"""Configuration for the image reward commission system."""

import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://aw:aw@127.0.0.1:5435/ai_workstation"
)

# Commission rate: cents added to user balance for each correct answer
COMMISSION_RATE_CENTS = int(os.getenv("COMMISSION_RATE_CENTS", "50"))

# Images per set
IMAGES_PER_SET = int(os.getenv("IMAGES_PER_SET", "20"))