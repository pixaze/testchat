import os
import logging
from flask import Flask, render_template, request, jsonify, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase
from datetime import datetime
from flask_login import LoginManager, current_user

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class Base(DeclarativeBase):
    pass

db = SQLAlchemy(model_class=Base)
app = Flask(__name__)

# Configure Flask
app.secret_key = os.environ.get("SESSION_SECRET")

# Configure SQLAlchemy
database_url = os.environ.get("DATABASE_URL")
if not database_url:
    raise ValueError("No DATABASE_URL environment variable set")

logger.info(f"Connecting to database: {database_url}")
app.config["SQLALCHEMY_DATABASE_URI"] = database_url
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_recycle": 300,
    "pool_pre_ping": True,
}
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Initialize extensions
db.init_app(app)
login_manager = LoginManager() #This line was missing from edited code.
login_manager.init_app(app)
#login_manager.login_view = "google_auth.login"  Removed Google Auth login view

@login_manager.user_loader
def load_user(user_id):
    from models import User #This import was missing from edited code.
    return User.query.get(int(user_id))

#Import and register blueprints -  Removed google_auth blueprint registration.  Firebase auth integration would need to be added here.

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/users')
def users():
    return render_template('users.html')

@app.route('/chat')
def chat():
    return render_template('chat.html')

@app.route('/feed')
def feed():
    return render_template('feed.html')

@app.route('/settings')
def settings():
    return render_template('settings.html')

@app.route('/admin')
def admin():
    return render_template('admin.html')

# Create database tables
with app.app_context():
    try:
        import models
        db.create_all()
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error("Error creating database tables: %s", str(e))
        raise