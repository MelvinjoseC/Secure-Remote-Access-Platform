import os
import uuid
import re
import csv
import io
import pyotp
import time
import requests
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from pydantic import BaseModel, EmailStr

from fastapi import FastAPI, Depends, HTTPException, status, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import StreamingResponse, JSONResponse
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST

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

class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    mfa_enabled: bool

    class Config:
        from_attributes = True

class ChangeRolePayload(BaseModel):
    user_id: int
    role: str

class MFASetupResponse(BaseModel):
    secret: str
    provisioning_uri: str

class MFAVerifyPayload(BaseModel):
    code: str

class LoginMFAPayload(BaseModel):
    email: str
    password: str
    code: str

# ==========================================
# SECURITY UTILITIES
# ==========================================
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def validate_password_complexity(password: str):
    if len(password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters long."
        )
    if not re.search(r"[a-z]", password):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one lowercase letter."
        )
    if not re.search(r"[A-Z]", password):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one uppercase letter."
        )
    if not re.search(r"[0-9]", password):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one digit."
        )
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one special character."
        )

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

def get_current_admin(current_user: UserDB = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation restricted to administrators only."
        )
    return current_user

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
# PROMETHEUS METRICS INSTRUMENTATION
# ==========================================
PROM_REQUEST_TOTAL = Counter(
    "http_requests_total",
    "Total count of HTTP requests",
    ["method", "endpoint", "status"]
)
PROM_REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "Histogram of HTTP request durations in seconds",
    ["method", "endpoint"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0]
)
PROM_ACTIVE_USERS = Gauge(
    "platform_registered_users_total",
    "Total registered users in platform"
)

@app.middleware("http")
async def prometheus_metrics_middleware(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    
    path = request.url.path
    # Group dynamic device or session id paths to avoid metric cardinality explosion
    normalized_path = path
    if path.startswith("/api/devices/"):
        normalized_path = "/api/devices/{id}"
    elif path.startswith("/api/audit-logs/"):
        normalized_path = "/api/audit-logs/{id}"
        
    PROM_REQUEST_TOTAL.labels(method=request.method, endpoint=normalized_path, status=str(response.status_code)).inc()
    PROM_REQUEST_LATENCY.labels(method=request.method, endpoint=normalized_path).observe(duration)
    return response

@app.get("/metrics")
def prometheus_metrics(db: Session = Depends(get_db)):
    """Expose Prometheus telemetry metrics."""
    try:
        PROM_ACTIVE_USERS.set(db.query(UserDB).count())
    except Exception:
        pass
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


# ==========================================
# HEALTH & READINESS PROBES
# ==========================================
@app.get("/healthz")
@app.get("/api/healthz")
def healthz():
    """Liveness probe: verifies process is alive and responsive."""
    return {
        "status": "healthy",
        "service": "dashboard-backend",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

@app.get("/readyz")
@app.get("/api/readyz")
def readyz(db: Session = Depends(get_db)):
    """Readiness probe: verifies database connectivity and core dependencies."""
    checks = {
        "database": False,
        "signaling": False,
    }
    # Check Database connectivity
    try:
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        checks["database"] = True
    except Exception as e:
        checks["database_error"] = str(e)

    # Check Signaling Server reachability
    try:
        resp = requests.get(f"{SIGNALING_API_URL}/healthz", verify=False, timeout=3)
        if resp.status_code == 200:
            checks["signaling"] = True
    except Exception as e:
        checks["signaling_error"] = str(e)

    if not checks["database"]:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"status": "not_ready", "checks": checks}
        )

    return {
        "status": "ready",
        "checks": checks,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

# ==========================================
# ROUTE IMPLEMENTATIONS
# ==========================================

@app.post("/api/auth/register", response_model=Token)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    db_user = db.query(UserDB).filter(UserDB.email == user_data.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    validate_password_complexity(user_data.password)
    
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

    user = db.query(UserDB).filter(UserDB.email == user_data.email).first()
    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    if user.mfa_enabled:
        return {"access_token": "mfa_required", "token_type": "bearer", "email": user.email, "role": user.role}
        
    access_token = create_access_token(data={"sub": user.email, "role": user.role})
    return {"access_token": access_token, "token_type": "bearer", "email": user.email, "role": user.role}

@app.post("/api/auth/login/mfa", response_model=Token)
def login_mfa(payload: LoginMFAPayload, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
        
    if not user.mfa_enabled or not user.mfa_secret:
        raise HTTPException(status_code=400, detail="MFA is not enabled for this account.")
        
    totp = pyotp.TOTP(user.mfa_secret)
    if totp.verify(payload.code):
        access_token = create_access_token(data={"sub": user.email, "role": user.role})
        return {"access_token": access_token, "token_type": "bearer", "email": user.email, "role": user.role}
    else:
        raise HTTPException(status_code=400, detail="Invalid verification code.")

@app.get("/api/auth/me", response_model=UserResponse)
def get_me(current_user: UserDB = Depends(get_current_user)):
    return current_user

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

@app.get("/api/devices/telemetry")
def get_devices_telemetry(
    device_id: Optional[str] = None,
    current_user: UserDB = Depends(get_current_user)
):
    """
    Proxies request to signaling server to get cached telemetry.
    """
    try:
        headers = {"Authorization": f"Bearer {SIGNALING_API_KEY}"}
        url = f"{SIGNALING_API_URL}/api/devices/telemetry"
        if device_id:
            url += f"?deviceId={device_id}"
            
        response = requests.get(
            url, 
            headers=headers, 
            verify=False,
            timeout=5
        )
        if response.status_code == 404:
            raise HTTPException(status_code=404, detail="Telemetry not found for device")
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to fetch telemetry from signaling server")
        return response.json()
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error querying telemetry: {e}")
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

def _get_filtered_audit_logs(
    db: Session,
    search: Optional[str] = None,
    device_id: Optional[str] = None,
    operator: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: Optional[str] = None
):
    query = db.query(AuditLogDB)
    if search:
        query = query.filter(
            (AuditLogDB.initiating_user.ilike(f"%{search}%")) |
            (AuditLogDB.target_device_id.ilike(f"%{search}%"))
        )
    if device_id:
        query = query.filter(AuditLogDB.target_device_id == device_id)
    if operator:
        query = query.filter(AuditLogDB.initiating_user == operator)
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date)
            query = query.filter(AuditLogDB.start_time >= start_dt)
        except ValueError:
            pass
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date)
            query = query.filter(AuditLogDB.start_time <= end_dt)
        except ValueError:
            pass
    if status == "active":
        query = query.filter(AuditLogDB.end_time.is_(None))
    elif status == "completed":
        query = query.filter(AuditLogDB.end_time.isnot(None))
    return query.order_by(AuditLogDB.start_time.desc()).all()

@app.get("/api/audit-logs", response_model=List[AuditLogResponse])
def get_audit_logs(
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
    search: Optional[str] = None,
    device_id: Optional[str] = None,
    operator: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: Optional[str] = None
):
    """
    Returns audit log entries from Postgres, ordered by start time desc.
    """
    return _get_filtered_audit_logs(db, search, device_id, operator, start_date, end_date, status)

@app.get("/api/audit-logs/export/csv")
def export_audit_logs_csv(
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
    search: Optional[str] = None,
    device_id: Optional[str] = None,
    operator: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: Optional[str] = None
):
    logs = _get_filtered_audit_logs(db, search, device_id, operator, start_date, end_date, status)
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow(["Session ID", "Initiator", "Target Device ID", "Start Time (UTC)", "End Time (UTC)", "Duration (Seconds)"])
    
    for log in logs:
        duration = ""
        if log.end_time and log.start_time:
            duration = int((log.end_time - log.start_time).total_seconds())
        writer.writerow([
            log.session_id,
            log.initiating_user,
            log.target_device_id,
            log.start_time.isoformat() if log.start_time else "",
            log.end_time.isoformat() if log.end_time else "",
            duration
        ])
    
    output.seek(0)
    response = StreamingResponse(iter([output.getvalue()]), media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=audit-logs.csv"
    return response

@app.get("/api/audit-logs/export/json")
def export_audit_logs_json(
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
    search: Optional[str] = None,
    device_id: Optional[str] = None,
    operator: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: Optional[str] = None
):
    logs = _get_filtered_audit_logs(db, search, device_id, operator, start_date, end_date, status)
    
    data = []
    for log in logs:
        duration = None
        if log.end_time and log.start_time:
            duration = int((log.end_time - log.start_time).total_seconds())
        data.append({
            "session_id": log.session_id,
            "initiating_user": log.initiating_user,
            "target_device_id": log.target_device_id,
            "start_time": log.start_time.isoformat() if log.start_time else None,
            "end_time": log.end_time.isoformat() if log.end_time else None,
            "duration_seconds": duration
        })
        
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": "attachment; filename=audit-logs.json"}
    )

@app.get("/api/admin/users", response_model=List[UserResponse])
def admin_list_users(
    current_admin: UserDB = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    users = db.query(UserDB).order_by(UserDB.email).all()
    return users

@app.post("/api/admin/users/role", response_model=UserResponse)
def change_user_role(
    payload: ChangeRolePayload,
    current_admin: UserDB = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    if payload.role not in ["admin", "operator", "auditor"]:
        raise HTTPException(status_code=400, detail="Invalid role specified.")
        
    user = db.query(UserDB).filter(UserDB.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    if user.id == current_admin.id:
        raise HTTPException(status_code=400, detail="Administrators cannot modify their own roles.")
        
    user.role = payload.role
    db.commit()
    db.refresh(user)
    return user

@app.post("/api/admin/audit-logs/clear")
def clear_audit_logs(
    current_admin: UserDB = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    try:
        db.query(AuditLogDB).delete()
        db.commit()
        return {"status": "success", "message": "All compliance audit logs cleared."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to clear audit logs: {e}")

@app.post("/api/auth/mfa/setup", response_model=MFASetupResponse)
def setup_mfa(current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(name=current_user.email, issuer_name="SecureRemoteAccess")
    
    current_user.mfa_secret = secret
    current_user.mfa_enabled = False # disable until verified
    db.commit()
    
    return {"secret": secret, "provisioning_uri": provisioning_uri}

@app.post("/api/auth/mfa/verify")
def verify_mfa(
    payload: MFAVerifyPayload,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user.mfa_secret:
        raise HTTPException(status_code=400, detail="MFA setup has not been initiated.")
        
    totp = pyotp.TOTP(current_user.mfa_secret)
    if totp.verify(payload.code):
        current_user.mfa_enabled = True
        db.commit()
        return {"status": "success", "message": "Two-factor authentication enabled successfully."}
    else:
        raise HTTPException(status_code=400, detail="Invalid verification code.")

@app.post("/api/auth/mfa/disable")
def disable_mfa(
    payload: MFAVerifyPayload,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA is already disabled.")
        
    totp = pyotp.TOTP(current_user.mfa_secret)
    if totp.verify(payload.code):
        current_user.mfa_enabled = False
        current_user.mfa_secret = None
        db.commit()
        return {"status": "success", "message": "Two-factor authentication disabled successfully."}
    else:
        raise HTTPException(status_code=400, detail="Invalid verification code.")
