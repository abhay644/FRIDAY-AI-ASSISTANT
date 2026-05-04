import sqlite3

def migrate():
    conn = sqlite3.connect('assistant.db')
    c = conn.cursor()
    
    # Check if phone column exists
    c.execute("PRAGMA table_info(users)")
    columns = [col[1] for col in c.fetchall()]
    
    if 'phone' not in columns:
        print("Adding 'phone' column to 'users' table...")
        c.execute("ALTER TABLE users ADD COLUMN phone TEXT")
    else:
        print("'phone' column already exists.")
        
    # Check if otps table exists
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='otps'")
    if not c.fetchone():
        print("Creating 'otps' table...")
        c.execute('''CREATE TABLE otps
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      user_id INTEGER,
                      code TEXT,
                      type TEXT,
                      expires_at TIMESTAMP,
                      verified INTEGER DEFAULT 0,
                      FOREIGN KEY (user_id) REFERENCES users (id))''')
    else:
        print("'otps' table already exists.")
        
    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
