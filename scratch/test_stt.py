import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv(override=True)

client = OpenAI(
    api_key=os.getenv('OPENAI_API_KEY'),
    base_url="https://api.groq.com/openai/v1"
)

# Test STT with a dummy file if possible, or just check if the method exists
try:
    # Just list models to see if whisper is available
    models = client.models.list()
    whisper_available = any(m.id == 'whisper-large-v3' for m in models.data)
    if whisper_available:
        print("SUCCESS: Whisper-large-v3 is available on Groq!")
    else:
        print("FAILURE: Whisper-large-v3 not found on Groq.")
except Exception as e:
    print(f"FAILURE: API error: {e}")
