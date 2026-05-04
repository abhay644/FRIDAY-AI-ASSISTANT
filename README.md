# AI Voice Assistant

A modern, responsive AI-powered voice assistant built with Flask, SQLite, and OpenAI.

## Features

- **Advanced Chat**: Context-aware chat using OpenAI's GPT models.
- **Voice Input (STT)**: Speak to the assistant using Whisper API or browser speech recognition.
- **Voice Output (TTS)**: The assistant responds with a natural-sounding voice (OpenAI TTS).
- **Memory & Context**: The assistant remembers previous conversations and relevant facts using embeddings.
- **Document Knowledge**: Upload PDFs or text files to chat with your documents.
- **Modern UI**: A premium, responsive interface with Dark Mode support and glassmorphism aesthetics.
- **Secure Auth**: Built-in user registration and login system.

## Setup Instructions

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure Environment**:
   Create a `.env` file (or update the existing one) with your API key:
   ```env
   OPENAI_API_KEY=your_actual_api_key_here
   SECRET_KEY=your_custom_secret_key
   ```

3. **Run the Application**:
   ```bash
   python app.py
   ```

4. **Access the Assistant**:
   Open [http://localhost:5000](http://localhost:5000) in your browser.

## Technologies Used

- **Frontend**: Vanilla JS, HTML5, CSS3 (Modern features, Glassmorphism)
- **Backend**: Python, Flask, Flask-CORS
- **Database**: SQLite3
- **AI Models**: 
  - GPT-3.5-Turbo (Chat)
  - Whisper-1 (Speech-to-Text)
  - TTS-1 (Text-to-Speech)
  - Sentence-Transformers (Embeddings)

## License
MIT
