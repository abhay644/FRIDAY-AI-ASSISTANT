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

##Screenshots
<img width="1899" height="916" alt="Screenshot 2026-05-04 153312" src="https://github.com/user-attachments/assets/2e454b60-b59e-498e-893c-47f937f4d66e" />
<img width="1884" height="909" alt="Screenshot 2026-05-04 153352" src="https://github.com/user-attachments/assets/f196f3ea-6990-43cd-9000-e9bca13e9498" />
<img width="1892" height="913" alt="Screenshot 2026-05-04 153334" src="https://github.com/user-attachments/assets/feddc120-7ff0-4865-b86a-82e92ed614c8" />
<img width="1887" height="913" alt="Screenshot 2026-05-04 153419" src="https://github.com/user-attachments/assets/c6163474-ac58-4649-879c-099b2a37c729" />
<img width="1902" height="870" alt="Screenshot 2026-05-04 153801" src="https://github.com/user-attachments/assets/8f5cb9cc-345c-45ae-ac28-acb30e56a2f9" />


