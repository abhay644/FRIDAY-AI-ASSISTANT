import os
import json
import sqlite3
import hashlib
import jwt
import datetime
from functools import wraps
from flask import Flask, request, jsonify, render_template, Response, stream_with_context
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI
import requests

import numpy as np
from sentence_transformers import SentenceTransformer
import pickle
import re
from werkzeug.utils import secure_filename
import PyPDF2
import io
import random
import string
import webbrowser
import subprocess
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests


# Load environment variables
load_dotenv(override=True)

app = Flask(__name__, template_folder='templates', static_folder='static')
app.secret_key = os.getenv('SECRET_KEY', 'your-secret-key-here-change-this')
CORS(app)

# Initialize Groq client (using OpenAI compatible interface)
client = OpenAI(
    api_key=os.getenv('OPENAI_API_KEY'),
    base_url="https://api.groq.com/openai/v1"
)

# Initialize sentence transformer for embeddings
try:
    embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
except Exception as e:
    print(f"Error loading embedding model: {e}")
    # Fallback or dummy if needed, but we usually expect this to work in this environment
    embedding_model = None

# Configuration
UPLOAD_FOLDER = 'static/uploads'
ALLOWED_EXTENSIONS = {'pdf', 'txt', 'md', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'ogg'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs('static/audio', exist_ok=True)

# Database setup
def init_db():
    conn = sqlite3.connect('assistant.db')
    c = conn.cursor()
    
    # Users table
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  username TEXT UNIQUE,
                  password TEXT,
                  email TEXT,
                  phone TEXT,
                  preferences TEXT,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    
    # Ensure phone column exists (migration for existing DBs)
    c.execute("PRAGMA table_info(users)")
    columns = [col[1] for col in c.fetchall()]
    if 'phone' not in columns:
        c.execute("ALTER TABLE users ADD COLUMN phone TEXT")
    
    # OTPs table
    c.execute('''CREATE TABLE IF NOT EXISTS otps
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER,
                  code TEXT,
                  type TEXT,
                  expires_at TIMESTAMP,
                  verified INTEGER DEFAULT 0,
                  FOREIGN KEY (user_id) REFERENCES users (id))''')
    
    # Conversations table
    c.execute('''CREATE TABLE IF NOT EXISTS conversations
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER,
                  title TEXT,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (user_id) REFERENCES users (id))''')
    
    # Messages table
    c.execute('''CREATE TABLE IF NOT EXISTS messages
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  conversation_id INTEGER,
                  role TEXT,
                  content TEXT,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (conversation_id) REFERENCES conversations (id))''')
    
    # Memory table
    c.execute('''CREATE TABLE IF NOT EXISTS memories
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER,
                  content TEXT,
                  embedding BLOB,
                  metadata TEXT,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    
    # Documents table
    c.execute('''CREATE TABLE IF NOT EXISTS documents
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER,
                  filename TEXT,
                  content TEXT,
                  chunks TEXT,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    
    conn.commit()
    conn.close()

init_db()

# JWT Token decorator
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'Token is missing'}), 401
        try:
            if token.startswith('Bearer '):
                token = token.split(' ')[1]
            data = jwt.decode(token, app.secret_key, algorithms=['HS256'])
            current_user = get_user_by_id(data['user_id'])
            if not current_user:
                return jsonify({'error': 'User not found'}), 401
        except Exception as e:
            print(f"Token error: {e}")
            return jsonify({'error': 'Token is invalid'}), 401
        return f(current_user, *args, **kwargs)
    return decorated

def get_user_by_id(user_id):
    conn = sqlite3.connect('assistant.db')
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = c.fetchone()
    conn.close()
    return user

@app.route('/api/weather', methods=['POST'])
@token_required
def get_weather(current_user):
    try:
        data = request.json
        lat = data.get('lat')
        lon = data.get('lon')
        
        if not lat or not lon:
            return jsonify({'error': 'Latitude and longitude required'}), 400
        
        # Get forecast (next 7 days) and current
        forecast_url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto"
        forecast_res = requests.get(forecast_url).json()
        
        # Get historical (last 7 days)
        # Calculate dates
        today = datetime.datetime.now()
        start_date = (today - datetime.timedelta(days=7)).strftime('%Y-%m-%d')
        end_date = (today - datetime.timedelta(days=1)).strftime('%Y-%m-%d')
        
        hist_url = f"https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}&start_date={start_date}&end_date={end_date}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto"
        hist_res = requests.get(hist_url).json()
        
        return jsonify({
            'current': forecast_res.get('current_weather'),
            'forecast': forecast_res.get('daily'),
            'history': hist_res.get('daily')
        })
    except Exception as e:
        print(f"Weather error: {e}")
        return jsonify({'error': str(e)}), 500

# Routes
@app.route('/')
@app.route('/login')
def login_page():
    return render_template('login.html', google_client_id=os.getenv('GOOGLE_CLIENT_ID', ''))

@app.route('/dashboard')
def index():
    return render_template('index.html')

@app.route('/register')
def register_page():
    return render_template('register.html')

@app.route('/set-password')
def set_password_page():
    return render_template('set-password.html')

@app.route('/forgot-password')
def forgot_password_page():
    return render_template('forgot-password.html')

@app.route('/api/auth/register', methods=['POST'])
def api_register():
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')
        email = data.get('email')
        phone = data.get('phone')
        
        if not username or not password:
            return jsonify({'error': 'Username and password required'}), 400
        
        hashed_password = hashlib.sha256(password.encode()).hexdigest()
        
        conn = sqlite3.connect('assistant.db')
        c = conn.cursor()
        c.execute("INSERT INTO users (username, password, email, phone, preferences) VALUES (?, ?, ?, ?, ?)",
                 (username, hashed_password, email, phone, '{}'))
        conn.commit()
        user_id = c.lastrowid
        conn.close()
        
        token = jwt.encode({'user_id': user_id, 'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)},
                          app.secret_key, algorithm='HS256')
        
        return jsonify({'token': token, 'user_id': user_id, 'username': username})
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Username already exists'}), 400
    except Exception as e:
        print(f"Register error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return jsonify({'error': 'Username and password required'}), 400
        
        hashed_password = hashlib.sha256(password.encode()).hexdigest()
        
        conn = sqlite3.connect('assistant.db')
        c = conn.cursor()
        c.execute("SELECT * FROM users WHERE username = ? AND password = ?", (username, hashed_password))
        user = c.fetchone()
        conn.close()
        
        if user:
            token = jwt.encode({'user_id': user[0], 'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)},
                              app.secret_key, algorithm='HS256')
            return jsonify({'token': token, 'user_id': user[0], 'username': username})
        else:
            return jsonify({'error': 'Invalid credentials'}), 401
    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/google/callback', methods=['POST'])
def google_callback():
    try:
        data = request.json
        token = data.get('credential')
        client_id = os.getenv('GOOGLE_CLIENT_ID')
        
        if not token:
            return jsonify({'error': 'Google token missing'}), 400
        
        # Verify the token
        idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), client_id)
        
        email = idinfo['email']
        username = idinfo.get('name', email.split('@')[0])
        
        # Check if user exists
        conn = sqlite3.connect('assistant.db')
        c = conn.cursor()
        c.execute("SELECT id, username, password FROM users WHERE email = ?", (email,))
        user = c.fetchone()
        conn.close()
        
        if user:
            # User exists, check if they have a password
            if user[2]: # password column is user[2] based on table schema (id, username, password, email, preferences, created_at)
                token = jwt.encode({'user_id': user[0], 'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)},
                                  app.secret_key, algorithm='HS256')
                return jsonify({
                    'status': 'success',
                    'token': token,
                    'user_id': user[0],
                    'username': user[1]
                })
            else:
                # User exists but no password
                return jsonify({
                    'status': 'need_password',
                    'email': email,
                    'username': user[1]
                })
        else:
            # New user, need to set password
            return jsonify({
                'status': 'need_password',
                'email': email,
                'username': username
            })
            
    except ValueError as e:
        # Invalid token
        print(f"Google Token validation error: {e}")
        return jsonify({'error': 'Invalid Google token'}), 401
    except Exception as e:
        print(f"Google callback error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/google/register', methods=['POST'])
def google_register():
    try:
        data = request.json
        email = data.get('email')
        password = data.get('password')
        username = data.get('username')
        
        if not email or not password:
            return jsonify({'error': 'Email and password required'}), 400
            
        hashed_password = hashlib.sha256(password.encode()).hexdigest()
        
        conn = sqlite3.connect('assistant.db')
        c = conn.cursor()
        
        # Check if user with this email already exists
        c.execute("SELECT id FROM users WHERE email = ?", (email,))
        existing_user = c.fetchone()
        
        if existing_user:
            # Update password for existing email
            c.execute("UPDATE users SET password = ?, username = ? WHERE id = ?", 
                     (hashed_password, username, existing_user[0]))
            user_id = existing_user[0]
        else:
            # Create new user
            # Ensure username is unique
            c.execute("SELECT id FROM users WHERE username = ?", (username,))
            if c.fetchone():
                username = f"{username}_{hashlib.md5(email.encode()).hexdigest()[:5]}"
                
            c.execute("INSERT INTO users (username, password, email, preferences) VALUES (?, ?, ?, ?)",
                     (username, hashed_password, email, '{}'))
            user_id = c.lastrowid
            
        conn.commit()
        conn.close()
        
        token = jwt.encode({'user_id': user_id, 'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)},
                          app.secret_key, algorithm='HS256')
        
        return jsonify({'token': token, 'user_id': user_id, 'username': username})
        
    except Exception as e:
        print(f"Google register error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/otp/send', methods=['POST'])
def send_otp():
    try:
        data = request.json
        identifier = data.get('identifier') # email or phone
        
        if not identifier:
            return jsonify({'error': 'Email or phone required'}), 400
            
        conn = sqlite3.connect('assistant.db')
        c = conn.cursor()
        
        # Check if identifier is email or phone
        is_email = '@' in identifier
        if is_email:
            c.execute("SELECT id FROM users WHERE email = ?", (identifier,))
        else:
            c.execute("SELECT id FROM users WHERE phone = ?", (identifier,))
            
        user = c.fetchone()
        if not user:
            conn.close()
            return jsonify({'error': 'User not found'}), 404
            
        user_id = user[0]
        
        # Generate OTP
        if is_email:
            code = ''.join(random.choices(string.digits, k=4)) # 4 digits for email
            type = 'email'
        else:
            code = ''.join(random.choices(string.digits, k=6)) # 6 digits for mobile
            type = 'mobile'
            
        expires_at = datetime.datetime.now() + datetime.timedelta(minutes=5)
        
        # Store OTP
        c.execute("INSERT INTO otps (user_id, code, type, expires_at) VALUES (?, ?, ?, ?)",
                 (user_id, code, type, expires_at))
        conn.commit()
        conn.close()
        
        # LOG THE OTP (Placeholder for actual sending service)
        print("\n" + "="*30)
        print(f"OTP FOR {identifier} ({type}): {code}")
        print(f"Expires at: {expires_at}")
        print("="*30 + "\n")
        
        return jsonify({'message': f'OTP sent to your {type}', 'type': type})
        
    except Exception as e:
        print(f"Send OTP error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/otp/verify', methods=['POST'])
def verify_otp():
    try:
        data = request.json
        identifier = data.get('identifier')
        code = data.get('code')
        
        if not identifier or not code:
            return jsonify({'error': 'Identifier and code required'}), 400
            
        conn = sqlite3.connect('assistant.db')
        c = conn.cursor()
        
        is_email = '@' in identifier
        if is_email:
            c.execute("SELECT id FROM users WHERE email = ?", (identifier,))
        else:
            c.execute("SELECT id FROM users WHERE phone = ?", (identifier,))
            
        user = c.fetchone()
        if not user:
            conn.close()
            return jsonify({'error': 'User not found'}), 404
            
        user_id = user[0]
        
        # Check latest OTP
        c.execute("""SELECT id, expires_at FROM otps 
                     WHERE user_id = ? AND code = ? AND verified = 0 
                     ORDER BY created_at DESC LIMIT 1""", (user_id, code))
        # Wait, I didn't add created_at to otps table in init_db. Let's just use id.
        c.execute("""SELECT id, expires_at FROM otps 
                     WHERE user_id = ? AND code = ? AND verified = 0 
                     ORDER BY id DESC LIMIT 1""", (user_id, code))
                     
        otp_record = c.fetchone()
        if not otp_record:
            conn.close()
            return jsonify({'error': 'Invalid code'}), 401
            
        otp_id, expires_at_str = otp_record
        expires_at = datetime.datetime.strptime(expires_at_str, '%Y-%m-%d %H:%M:%S.%f')
        
        if datetime.datetime.now() > expires_at:
            conn.close()
            return jsonify({'error': 'OTP expired'}), 401
            
        # Mark as verified
        c.execute("UPDATE otps SET verified = 1 WHERE id = ?", (otp_id,))
        conn.commit()
        conn.close()
        
        # Create a temporary reset token (JWT)
        reset_token = jwt.encode({
            'user_id': user_id, 
            'type': 'reset',
            'exp': datetime.datetime.utcnow() + datetime.timedelta(minutes=10)
        }, app.secret_key, algorithm='HS256')
        
        return jsonify({'reset_token': reset_token})
        
    except Exception as e:
        print(f"Verify OTP error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    try:
        data = request.json
        token = data.get('reset_token')
        new_password = data.get('password')
        
        if not token or not new_password:
            return jsonify({'error': 'Token and password required'}), 400
            
        try:
            payload = jwt.decode(token, app.secret_key, algorithms=['HS256'])
            if payload.get('type') != 'reset':
                return jsonify({'error': 'Invalid token type'}), 401
            user_id = payload['user_id']
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Reset token expired'}), 401
        except Exception:
            return jsonify({'error': 'Invalid reset token'}), 401
            
        hashed_password = hashlib.sha256(new_password.encode()).hexdigest()
        
        conn = sqlite3.connect('assistant.db')
        c = conn.cursor()
        c.execute("UPDATE users SET password = ? WHERE id = ?", (hashed_password, user_id))
        conn.commit()
        conn.close()
        
        return jsonify({'message': 'Password reset successful'})
        
    except Exception as e:
        print(f"Reset password error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/chat/stream', methods=['POST'])
@token_required
def chat_stream(current_user):
    try:
        data = request.json
        message = data.get('message')
        conversation_id = data.get('conversation_id')
        user_id = current_user[0]
        
        if not message:
            return jsonify({'error': 'Message required'}), 400
        
        # Get or create conversation
        if not conversation_id or conversation_id == 'new':
            conn = sqlite3.connect('assistant.db')
            c = conn.cursor()
            c.execute("INSERT INTO conversations (user_id, title) VALUES (?, ?)",
                     (user_id, message[:50] if len(message) > 50 else message))
            conversation_id = c.lastrowid
            conn.commit()
            conn.close()
        
        # Save user message
        conn = sqlite3.connect('assistant.db')
        c = conn.cursor()
        c.execute("INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)",
                 (conversation_id, 'user', message))
        conn.commit()
        conn.close()
        
        # Get conversation history
        history = get_conversation_history(conversation_id)
        # Retrieve relevant memories
        memories = retrieve_memories(user_id, message)
        
        # Prepare system prompt
        system_prompt = f"""You are an advanced AI assistant with memory and OS control capabilities.
 
Previous relevant memories:
{memories if memories else 'No previous memories'}
 
Guidelines:
- Be helpful, concise, and friendly.
- Respond in the same language as the user.
- If you don't know something, say so honestly.
- **OS CONTROL**: You can execute system commands by including a tag at the END of your response.
  Available commands:
  - [COMMAND: open_youtube] -> Open YouTube
  - [COMMAND: open_google] -> Open Google
  - [COMMAND: open_gmail] -> Open Gmail
  - [COMMAND: open_calculator] -> Open Calculator
  - [COMMAND: open_notepad] -> Open Notepad
  - [COMMAND: open_settings] -> Open Windows Settings
  - [COMMAND: open_explorer] -> Open File Explorer
  - [COMMAND: open_url|URL] -> Open ANY website URL (e.g., [COMMAND: open_url|https://facebook.com])
  
  Example: "Sure, opening Facebook for you. [COMMAND: open_url|https://facebook.com]"
"""
        
        # Prepare messages for OpenAI
        messages = [
            {"role": "system", "content": system_prompt}
        ]
        
        # Add last 10 messages from history
        for msg in history[-10:]:
            messages.append({"role": msg[0], "content": msg[1]})
        
        messages.append({"role": "user", "content": message})
        
        def generate():
            full_response = ""
            try:
                response = client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=messages,
                    stream=True,
                    temperature=0.7,
                    max_tokens=1000
                )
                
                for chunk in response:
                    if chunk.choices and chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        full_response += content
                        yield f"data: {json.dumps({'chunk': content})}\n\n"

                
                # Save assistant message
                conn = sqlite3.connect('assistant.db')
                c = conn.cursor()
                c.execute("INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)",
                         (conversation_id, 'assistant', full_response))
                conn.commit()
                conn.close()
                
                # Store in memory
                store_memory(user_id, f"User: {message}\nAssistant: {full_response}")
                
                yield f"data: {json.dumps({'done': True, 'full_response': full_response, 'conversation_id': conversation_id})}\n\n"
                
            except Exception as e:
                print(f"Groq/OpenAI error: {e}")
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
        
        return Response(stream_with_context(generate()), mimetype='text/event-stream')
    except Exception as e:
        print(f"Chat stream error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/system/execute', methods=['POST'])
@token_required
def execute_command(current_user):
    try:
        data = request.json
        command = data.get('command')
        
        if not command:
            return jsonify({'error': 'No command provided'}), 400
            
        print(f"Executing system command: {command}")
        
        if command == 'open_youtube':
            webbrowser.open('https://youtube.com')
        elif command == 'open_google':
            webbrowser.open('https://google.com')
        elif command.startswith('open_url|'):
            url = command.split('|')[1]
            if not url.startswith('http'):
                url = 'https://' + url
            webbrowser.open(url)
        elif command == 'open_gmail':
            webbrowser.open('https://mail.google.com')
        elif command == 'open_calculator':
            subprocess.Popen('calc.exe')
        elif command == 'open_notepad':
            subprocess.Popen('notepad.exe')
        elif command == 'open_settings':
            subprocess.Popen('start ms-settings:', shell=True)
        elif command == 'open_explorer':
            subprocess.Popen('explorer.exe')
        else:
            return jsonify({'error': 'Unknown command'}), 400
            
        return jsonify({'status': 'success', 'message': f'Executed {command}'})
    except Exception as e:
        print(f"System execution error: {e}")
        return jsonify({'error': str(e)}), 500

def get_conversation_history(conversation_id):
    conn = sqlite3.connect('assistant.db')
    c = conn.cursor()
    c.execute("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC", 
             (conversation_id,))
    history = c.fetchall()
    conn.close()
    return history

def retrieve_memories(user_id, query, limit=3):
    if not embedding_model:
        return ""
    try:
        query_embedding = embedding_model.encode(query)
        
        conn = sqlite3.connect('assistant.db')
        c = conn.cursor()
        c.execute("SELECT content, embedding FROM memories WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", 
                 (user_id,))
        memories = c.fetchall()
        conn.close()
        
        # Calculate similarity scores
        scored_memories = []
        for content, embedding_blob in memories:
            if embedding_blob:
                try:
                    stored_embedding = pickle.loads(embedding_blob)
                    similarity = np.dot(query_embedding, stored_embedding) / (np.linalg.norm(query_embedding) * np.linalg.norm(stored_embedding))
                    scored_memories.append((similarity, content))
                except:
                    continue
        
        scored_memories.sort(reverse=True, key=lambda x: x[0])
        return "\n".join([mem[1] for mem in scored_memories[:limit]])
    except Exception as e:
        print(f"Memory retrieval error: {e}")
        return ""

def store_memory(user_id, content):
    if not embedding_model:
        return
    try:
        embedding = embedding_model.encode(content)
        embedding_blob = pickle.dumps(embedding)
        
        conn = sqlite3.connect('assistant.db')
        c = conn.cursor()
        c.execute("INSERT INTO memories (user_id, content, embedding) VALUES (?, ?, ?)",
                 (user_id, content, embedding_blob))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Memory store error: {e}")

@app.route('/api/voice/stt', methods=['POST'])
@token_required
def speech_to_text(current_user):
    temp_path = None
    try:
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file'}), 400
        
        audio_file = request.files['audio']
        print(f"Received audio file: {audio_file.filename}")
        
        # Save audio temporarily
        temp_path = f"temp_audio_{current_user[0]}.webm"
        audio_file.save(temp_path)
        
        # Convert to text using Groq Whisper
        print(f"Sending to Groq Whisper API...")
        with open(temp_path, 'rb') as audio:
            transcript = client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=("audio.webm", audio, "audio/webm")
            )
        
        print(f"Transcription successful: {transcript.text}")
        
        return jsonify({'text': transcript.text})

    except Exception as e:
        print(f"STT error: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except:
                pass

@app.route('/api/voice/tts', methods=['POST'])
@token_required
def text_to_speech(current_user):
    try:
        data = request.json
        text = data.get('text')
        
        if not text:
            return jsonify({'error': 'Text required'}), 400
        
        # Using OpenAI TTS (Note: This might fail if using Groq key, as Groq doesn't have TTS yet)
        # We'll provide a response that suggests browser fallback if this fails
        try:
            response = client.audio.speech.create(
                model="tts-1",
                voice="nova",
                input=text
            )
            
            # Save audio file
            audio_filename = f"speech_{current_user[0]}_{hashlib.md5(text.encode()).hexdigest()[:10]}.mp3"
            audio_path = os.path.join('static/audio', audio_filename)
            response.write_to_file(audio_path)
            
            return jsonify({'audio_url': f'/static/audio/{audio_filename}'})
        except Exception as tts_err:
            print(f"Backend TTS failed (likely due to Groq/OpenAI key mismatch): {tts_err}")
            return jsonify({'error': 'Backend TTS unavailable', 'fallback': True}), 200

    except Exception as e:
        print(f"TTS route error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/memory/documents', methods=['POST'])
@token_required
def upload_document(current_user):
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Check if it's a media file
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
        if ext in {'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'ogg'}:
            return jsonify({
                'message': 'Media uploaded successfully',
                'type': 'media',
                'url': f'/static/uploads/{filename}',
                'filename': filename,
                'file_type': 'video' if ext in {'mp4', 'webm', 'ogg'} else 'image'
            })

        # Extract text from document
        text = extract_text_from_file(filepath, filename)
        
        if text:
            # Split into chunks
            chunks = split_text_into_chunks(text, 500)
            
            # Store in database
            conn = sqlite3.connect('assistant.db')
            c = conn.cursor()
            chunks_json = json.dumps(chunks)
            c.execute("INSERT INTO documents (user_id, filename, content, chunks) VALUES (?, ?, ?, ?)",
                     (current_user[0], filename, text[:1000], chunks_json))
            doc_id = c.lastrowid
            conn.commit()
            
            # Store first few chunks as memory
            for i, chunk in enumerate(chunks[:5]):
                store_memory(current_user[0], f"[Document: {filename}] {chunk[:200]}")
            
            conn.close()
            
            return jsonify({
                'message': 'Document processed successfully', 
                'type': 'document',
                'chunks': len(chunks), 
                'doc_id': doc_id,
                'filename': filename
            })
        
        return jsonify({'error': 'Could not extract text'}), 400
    except Exception as e:
        print(f"Upload error: {e}")
        return jsonify({'error': str(e)}), 500

def extract_text_from_file(filepath, filename):
    text = ""
    try:
        if filename.lower().endswith('.pdf'):
            with open(filepath, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                for page in pdf_reader.pages:
                    text += page.extract_text()
        elif filename.lower().endswith(('.txt', '.md')):
            with open(filepath, 'r', encoding='utf-8') as file:
                text = file.read()
    except Exception as e:
        print(f"Text extraction error: {e}")
    finally:
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
            except:
                pass
    return text

def split_text_into_chunks(text, chunk_size):
    words = text.split()
    chunks = []
    current_chunk = []
    current_length = 0
    
    for word in words:
        current_length += len(word) + 1
        if current_length > chunk_size:
            chunks.append(' '.join(current_chunk))
            current_chunk = [word]
            current_length = len(word)
        else:
            current_chunk.append(word)
    
    if current_chunk:
        chunks.append(' '.join(current_chunk))
    
    return chunks

@app.route('/api/chat/conversations/clear', methods=['DELETE'])
@token_required
def clear_all_conversations(current_user):
    try:
        conn = sqlite3.connect('assistant.db')
        c = conn.cursor()
        
        # Delete all messages in user's conversations
        c.execute("""
            DELETE FROM messages 
            WHERE conversation_id IN (
                SELECT id FROM conversations WHERE user_id = ?
            )
        """, (current_user[0],))
        
        # Delete all conversations for user
        c.execute("DELETE FROM conversations WHERE user_id = ?", (current_user[0],))
        
        conn.commit()
        conn.close()
        
        return jsonify({'message': 'All chat history cleared'})
    except Exception as e:
        print(f"Clear conversations error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/chat/conversations/<int:conversation_id>', methods=['DELETE'])
@token_required
def delete_conversation(current_user, conversation_id):
    try:
        conn = sqlite3.connect('assistant.db')
        c = conn.cursor()
        
        # Verify ownership
        c.execute("SELECT id FROM conversations WHERE id = ? AND user_id = ?", (conversation_id, current_user[0]))
        if not c.fetchone():
            conn.close()
            return jsonify({'error': 'Unauthorized or not found'}), 404
            
        c.execute("DELETE FROM messages WHERE conversation_id = ?", (conversation_id,))
        c.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
        
        conn.commit()
        conn.close()
        return jsonify({'message': 'Conversation deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chat/conversations', methods=['GET'])
@token_required
def get_conversations(current_user):
    try:
        conn = sqlite3.connect('assistant.db')
        c = conn.cursor()
        c.execute("SELECT id, title, created_at FROM conversations WHERE user_id = ? ORDER BY created_at DESC", 
                 (current_user[0],))
        convs = c.fetchall()
        conn.close()
        
        return jsonify({'conversations': [{'id': c[0], 'title': c[1], 'created_at': c[2]} for c in convs]})
    except Exception as e:
        print(f"Get conversations error: {e}")
        return jsonify({'conversations': []})

@app.route('/api/chat/history/<int:conversation_id>', methods=['GET'])
@token_required
def get_chat_history(current_user, conversation_id):
    try:
        conn = sqlite3.connect('assistant.db')
        c = conn.cursor()
        c.execute("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC", 
                 (conversation_id,))
        messages = c.fetchall()
        conn.close()
        
        return jsonify({'messages': [{'role': m[0], 'content': m[1]} for m in messages]})
    except Exception as e:
        print(f"Get history error: {e}")
        return jsonify({'messages': []})

if __name__ == '__main__':
    print("=" * 50)
    print("AI Voice Assistant Started!")
    print(f"Open http://localhost:5000 in your browser")
    print("=" * 50)
    app.run(debug=True, port=5000, host='0.0.0.0')

app = Flask(__name__) # Yeh line shuruat mein honi chahiye

# ... aapka baaki code ...

# Aakhir mein sirf yeh rehne dein (vercel ke liye app.run ki zaroorat nahi hoti)
if __name__ == "__main__":
    app.run()