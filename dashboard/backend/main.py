import os
import uuid
import time
import requests
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from pydantic import BaseModel, EmailStr

from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer

from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from passlib.context import CryptContext
import jwt

# ==========================================
# CONFIGURATION & SETTINGS
# ==========================================
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db:5432/remote_access")
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-dev-jwt-key")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

SIGNALING_API_URL = os.getenv("SIGNALING_API_URL", "https://signaling:8443")
SIGNALING_API_KEY = os.getenv("SIGNALING_API_KEY", "dev-signaling-secret-key")

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 bearer token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# ==========================================
# DATABASE SETUP
# ==========================================
Base = declarative_base()

class UserDB(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="operator")
    mfa_enabled = Column(Boolean, nullable=False, default=False)
    mfa_secret = Column(String, nullable=True)

class AuditLogDB(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, unique=True, index=True, nullable=False)
    initiating_user = Column(String, nullable=False)
    target_device_id = Column(String, nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=True)

# Connect to database (with retry for Compose startup sync)
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def seed_data(db: Session):
    # Check if we have users
    if db.query(UserDB).count() == 0:
        print("Seeding database with default accounts...")
        hashed_pwd = pwd_context.hash("Password123!")
        admin_user = UserDB(email="admin@platform.local", hashed_password=hashed_pwd, role="admin")
        operator_user = UserDB(email="operator@platform.local", hashed_password=hashed_pwd, role="operator")
        auditor_user = UserDB(email="auditor@platform.local", hashed_password=hashed_pwd, role="auditor")
        db.add(admin_user)
        db.add(operator_user)
        db.add(auditor_user)
        db.commit()
        
    # Check if we have audit logs
    if db.query(AuditLogDB).count() == 0:
        print("Seeding database with mock audit logs...")
        mock_logs = [
            AuditLogDB(
                session_id=str(uuid.uuid4()),
                initiating_user="demo@platform.local",
                target_device_id="offshore-vessel-gps-04",
                start_time=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2, hours=3),
                end_time=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2, hours=2, minutes=45)
            ),
            AuditLogDB(
                session_id=str(uuid.uuid4()),
                initiating_user="demo@platform.local",
                target_device_id="subsea-rov-arm-02",
                start_time=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1, hours=5),
                end_time=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1, hours=4, minutes=12)
            ),
            AuditLogDB(
                session_id=str(uuid.uuid4()),
                initiating_user="operator-team-blue@platform.local",
                target_device_id="test-drone-01",
                start_time=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=12),
                end_time=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=11, minutes=30)
            )
        ]
        db.bulk_save_objects(mock_logs)
        db.commit()

for attempt in range(10):
    try:
        Base.metadata.create_all(bind=engine)
        print("Database tables initialized successfully.")
        
        # Run Seed
        db_sess = SessionLocal()
        seed_data(db_sess)
        db_sess.close()
        break
    except Exception as e:
        print(f"Waiting for PostgreSQL database to start... (Attempt {attempt+1}/10), error: {e}")
        time.sleep(3)

# Dependency to get db session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ==========================================
# PYDANTIC SCHEMAS
# ==========================================
class UserRegister(BaseModel):
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    email: str
    role: str

class SessionStart(BaseModel):
    device_id: str

class SessionEnd(BaseModel):
    session_id: str

class AuditLogResponse(BaseModel):
    session_id: str
    initiating_user: str
    target_device_id: str
    start_time: datetime
    end_time: Optional[datetime] = None

    class Config:
        from_attributes = True

# ==========================================
# SECURITY UTILITIES
# ==========================================
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
    
    user = db.query(UserDB).filter(UserDB.email == email).first()
    if user is None:
        raise credentials_exception
    return user

# Simple in-memory login rate limiter (max 5 requests per 60 seconds per IP)
from collections import defaultdict
login_attempts = defaultdict(list)

def check_login_rate_limit(ip: str) -> bool:
    now = time.time()
    # Filter out attempts older than the window (60s)
    login_attempts[ip] = [t for t in login_attempts[ip] if now - t < 60]
    if len(login_attempts[ip]) >= 5:
        return False
    login_attempts[ip].append(now)
    return True

# ==========================================
# FASTAPI APP INITIALIZATION
# ==========================================
app = FastAPI(title="Secure Remote Access Platform Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to dashboard frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# ROUTE IMPLEMENTATIONS
# ==========================================

@app.post("/api/auth/register", response_model=Token)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    db_user = db.query(UserDB).filter(UserDB.email == user_data.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_pwd = get_password_hash(user_data.password)
    new_user = UserDB(email=user_data.email, hashed_password=hashed_pwd)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token = create_access_token(data={"sub": new_user.email, "role": new_user.role})
    return {"access_token": access_token, "token_type": "bearer", "email": new_user.email, "role": new_user.role}

@app.post("/api/auth/login", response_model=Token)
def login(request: Request, user_data: UserLogin, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    if not check_login_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again in a minute."
        )

    # TODO(stage-4): Add Multi-Factor Authentication (MFA) check here

    user = db.query(UserDB).filter(UserDB.email == user_data.email).first()
    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    access_token = create_access_token(data={"sub": user.email, "role": user.role})
    return {"access_token": access_token, "token_type": "bearer", "email": user.email, "role": user.role}

@app.get("/api/devices", response_model=List[str])
def list_devices(current_user: UserDB = Depends(get_current_user)):
    """
    Proxies request to signaling server to get list of currently connected agents.
    Uses TLS but skips certificate validation if self-signed (in dev environment).
    """
    try:
        headers = {"Authorization": f"Bearer {SIGNALING_API_KEY}"}
        # In local dev environment, skip certificate validation for self-signed certificates
        response = requests.get(
            f"{SIGNALING_API_URL}/api/devices", 
            headers=headers, 
            verify=False,
            timeout=5
        )
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to fetch active devices from signaling server")
        return response.json()
    except Exception as e:
        print(f"Error querying signaling server: {e}")
        # fallback to empty list instead of crashing, but raise HTTP 502 for visibility
        raise HTTPException(status_code=502, detail=f"Signaling server unreachable: {e}")

@app.post("/api/sessions/start", response_model=AuditLogResponse)
def start_session(payload: SessionStart, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Records the start of a session in PostgreSQL
    """
    # TODO(stage-4): Add Role-Based Access Control (RBAC) permission checks and session approval workflows here
    session_id = str(uuid.uuid4())
    log_entry = AuditLogDB(
        session_id=session_id,
        initiating_user=current_user.email,
        target_device_id=payload.device_id,
        start_time=datetime.now(timezone.utc).replace(tzinfo=None) # Store naive UTC
    )
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    return log_entry

@app.post("/api/sessions/end", response_model=AuditLogResponse)
def end_session(payload: SessionEnd, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Records the end of a session in PostgreSQL
    """
    log_entry = db.query(AuditLogDB).filter(AuditLogDB.session_id == payload.session_id).first()
    if not log_entry:
        raise HTTPException(status_code=404, detail="Session log not found")
    
    # Only allow ending if not already ended
    if log_entry.end_time is None:
        log_entry.end_time = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()
        db.refresh(log_entry)
        
    return log_entry

@app.get("/api/audit-logs", response_model=List[AuditLogResponse])
def get_audit_logs(current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Returns audit log entries from Postgres, ordered by start time desc.
    """
    logs = db.query(AuditLogDB).order_by(AuditLogDB.start_time.desc()).all()
    return logs
