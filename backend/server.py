from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Depends, status, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import json
import base64

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

security = HTTPBearer()

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# WebSocket Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}  # device_id: websocket
        self.device_connections: Dict[str, WebSocket] = {}  # Arduino devices
    
    async def connect(self, websocket: WebSocket, client_id: str, client_type: str = "user"):
        await websocket.accept()
        if client_type == "device":
            self.device_connections[client_id] = websocket
        else:
            self.active_connections[client_id] = websocket
    
    def disconnect(self, client_id: str, client_type: str = "user"):
        if client_type == "device":
            if client_id in self.device_connections:
                del self.device_connections[client_id]
        else:
            if client_id in self.active_connections:
                del self.active_connections[client_id]
    
    async def send_to_device(self, device_id: str, message: dict):
        if device_id in self.device_connections:
            await self.device_connections[device_id].send_json(message)
    
    async def broadcast_to_users(self, message: dict):
        for connection in self.active_connections.values():
            await connection.send_json(message)

manager = ConnectionManager()

# Models
class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    email: EmailStr
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DeviceType(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    pins_config: List[Dict[str, Any]] = []  # [{pin: 'D1', type: 'digital', mode: 'output'}]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Device(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    device_type_id: str
    auth_token: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    status: str = "offline"  # online/offline
    last_seen: Optional[datetime] = None
    firmware_version: Optional[str] = "1.0.0"
    ip_address: Optional[str] = None
    wifi_ssid: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DeviceCreate(BaseModel):
    name: str
    device_type_id: str

class FirmwareVersion(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    device_type_id: str
    version: str
    file_data: str  # base64 encoded binary
    file_size: int
    description: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SensorData(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    device_id: str
    data: Dict[str, Any]
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PinControl(BaseModel):
    device_id: str
    pin: str
    value: Any  # Can be int, bool, or string

# Helper Functions
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str) -> str:
    payload = {
        'user_id': user_id,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get('user_id')
        user = await db.users.find_one({'id': user_id}, {'_id': 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return User(**user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")

# Auth Routes
@api_router.post("/auth/register")
async def register(user_data: UserRegister):
    # Check if user exists
    existing = await db.users.find_one({'$or': [{'username': user_data.username}, {'email': user_data.email}]}, {'_id': 0})
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists")
    
    user = User(
        username=user_data.username,
        email=user_data.email
    )
    
    doc = user.model_dump()
    doc['password'] = hash_password(user_data.password)
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.users.insert_one(doc)
    token = create_token(user.id)
    
    return {'user': user, 'token': token}

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user_doc = await db.users.find_one({'username': credentials.username}, {'_id': 0})
    if not user_doc or not verify_password(credentials.password, user_doc['password']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user = User(**user_doc)
    token = create_token(user.id)
    
    return {'user': user, 'token': token}

# Device Type Routes
@api_router.post("/device-types", response_model=DeviceType)
async def create_device_type(device_type: DeviceType, current_user: User = Depends(get_current_user)):
    doc = device_type.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.device_types.insert_one(doc)
    return device_type

@api_router.get("/device-types", response_model=List[DeviceType])
async def get_device_types(current_user: User = Depends(get_current_user)):
    types = await db.device_types.find({}, {'_id': 0}).to_list(1000)
    for t in types:
        if isinstance(t['created_at'], str):
            t['created_at'] = datetime.fromisoformat(t['created_at'])
    return types

# Device Routes
@api_router.post("/devices", response_model=Device)
async def create_device(device_data: DeviceCreate, current_user: User = Depends(get_current_user)):
    device = Device(
        name=device_data.name,
        device_type_id=device_data.device_type_id,
        user_id=current_user.id
    )
    
    doc = device.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    if doc['last_seen']:
        doc['last_seen'] = doc['last_seen'].isoformat()
    
    await db.devices.insert_one(doc)
    return device

@api_router.get("/devices", response_model=List[Device])
async def get_devices(current_user: User = Depends(get_current_user)):
    devices = await db.devices.find({'user_id': current_user.id}, {'_id': 0}).to_list(1000)
    for d in devices:
        if isinstance(d['created_at'], str):
            d['created_at'] = datetime.fromisoformat(d['created_at'])
        if d.get('last_seen') and isinstance(d['last_seen'], str):
            d['last_seen'] = datetime.fromisoformat(d['last_seen'])
    return devices

@api_router.get("/devices/{device_id}", response_model=Device)
async def get_device(device_id: str, current_user: User = Depends(get_current_user)):
    device = await db.devices.find_one({'id': device_id, 'user_id': current_user.id}, {'_id': 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if isinstance(device['created_at'], str):
        device['created_at'] = datetime.fromisoformat(device['created_at'])
    if device.get('last_seen') and isinstance(device['last_seen'], str):
        device['last_seen'] = datetime.fromisoformat(device['last_seen'])
    return Device(**device)

@api_router.delete("/devices/{device_id}")
async def delete_device(device_id: str, current_user: User = Depends(get_current_user)):
    result = await db.devices.delete_one({'id': device_id, 'user_id': current_user.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    return {'message': 'Device deleted'}

# Firmware Routes
@api_router.post("/firmware/upload")
async def upload_firmware(
    device_type_id: str = Form(...),
    version: str = Form(...),
    description: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    file_content = await file.read()
    file_data_b64 = base64.b64encode(file_content).decode('utf-8')
    
    firmware = FirmwareVersion(
        device_type_id=device_type_id,
        version=version,
        file_data=file_data_b64,
        file_size=len(file_content),
        description=description
    )
    
    doc = firmware.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.firmware_versions.insert_one(doc)
    return {'id': firmware.id, 'version': firmware.version, 'size': firmware.file_size}

@api_router.get("/firmware/{device_type_id}")
async def get_firmware_versions(device_type_id: str, current_user: User = Depends(get_current_user)):
    versions = await db.firmware_versions.find(
        {'device_type_id': device_type_id, 'is_active': True},
        {'_id': 0, 'file_data': 0}
    ).to_list(1000)
    
    for v in versions:
        if isinstance(v['created_at'], str):
            v['created_at'] = datetime.fromisoformat(v['created_at'])
    
    return versions

@api_router.get("/firmware/download/{firmware_id}")
async def download_firmware(firmware_id: str, current_user: User = Depends(get_current_user)):
    firmware = await db.firmware_versions.find_one({'id': firmware_id}, {'_id': 0})
    if not firmware:
        raise HTTPException(status_code=404, detail="Firmware not found")
    
    return {
        'id': firmware['id'],
        'version': firmware['version'],
        'file_data': firmware['file_data'],
        'file_size': firmware['file_size']
    }

@api_router.post("/firmware/ota/{device_id}/{firmware_id}")
async def trigger_ota_update(device_id: str, firmware_id: str, current_user: User = Depends(get_current_user)):
    device = await db.devices.find_one({'id': device_id, 'user_id': current_user.id}, {'_id': 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    firmware = await db.firmware_versions.find_one({'id': firmware_id}, {'_id': 0})
    if not firmware:
        raise HTTPException(status_code=404, detail="Firmware not found")
    
    # Send OTA command to device via WebSocket
    await manager.send_to_device(device_id, {
        'type': 'ota_update',
        'firmware_id': firmware_id,
        'version': firmware['version'],
        'file_data': firmware['file_data'],
        'file_size': firmware['file_size']
    })
    
    return {'message': 'OTA update triggered', 'version': firmware['version']}

# Pin Control
@api_router.post("/control/pin")
async def control_pin(control: PinControl, current_user: User = Depends(get_current_user)):
    device = await db.devices.find_one({'id': control.device_id, 'user_id': current_user.id}, {'_id': 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    await manager.send_to_device(control.device_id, {
        'type': 'pin_control',
        'pin': control.pin,
        'value': control.value
    })
    
    return {'message': 'Command sent', 'pin': control.pin, 'value': control.value}

# Sensor Data
@api_router.get("/sensor-data/{device_id}")
async def get_sensor_data(device_id: str, limit: int = 100, current_user: User = Depends(get_current_user)):
    device = await db.devices.find_one({'id': device_id, 'user_id': current_user.id}, {'_id': 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    data = await db.sensor_data.find(
        {'device_id': device_id},
        {'_id': 0}
    ).sort('timestamp', -1).limit(limit).to_list(limit)
    
    for d in data:
        if isinstance(d['timestamp'], str):
            d['timestamp'] = datetime.fromisoformat(d['timestamp'])
    
    return data

# WebSocket for Users (Dashboard)
@app.websocket("/ws/dashboard/{user_id}")
async def websocket_dashboard(websocket: WebSocket, user_id: str):
    await manager.connect(websocket, user_id, "user")
    try:
        while True:
            data = await websocket.receive_text()
            # Handle any user commands
    except WebSocketDisconnect:
        manager.disconnect(user_id, "user")

# WebSocket for Arduino Devices
@app.websocket("/ws/device/{device_id}/{auth_token}")
async def websocket_device(websocket: WebSocket, device_id: str, auth_token: str):
    # Verify device
    device = await db.devices.find_one({'id': device_id, 'auth_token': auth_token}, {'_id': 0})
    if not device:
        await websocket.close(code=4001)
        return
    
    await manager.connect(websocket, device_id, "device")
    
    # Update device status to online
    await db.devices.update_one(
        {'id': device_id},
        {'$set': {'status': 'online', 'last_seen': datetime.now(timezone.utc).isoformat()}}
    )
    
    # Broadcast device status to users
    await manager.broadcast_to_users({
        'type': 'device_status',
        'device_id': device_id,
        'status': 'online'
    })
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get('type') == 'sensor_data':
                # Save sensor data
                sensor_data = SensorData(
                    device_id=device_id,
                    data=message.get('data', {})
                )
                doc = sensor_data.model_dump()
                doc['timestamp'] = doc['timestamp'].isoformat()
                await db.sensor_data.insert_one(doc)
                
                # Broadcast to users
                await manager.broadcast_to_users({
                    'type': 'sensor_data',
                    'device_id': device_id,
                    'data': message.get('data', {})
                })
            
            elif message.get('type') == 'firmware_update_status':
                # Update device firmware version
                if message.get('status') == 'success':
                    await db.devices.update_one(
                        {'id': device_id},
                        {'$set': {'firmware_version': message.get('version')}}
                    )
                
                await manager.broadcast_to_users({
                    'type': 'firmware_update_status',
                    'device_id': device_id,
                    'status': message.get('status'),
                    'version': message.get('version')
                })
    
    except WebSocketDisconnect:
        manager.disconnect(device_id, "device")
        
        # Update device status to offline
        await db.devices.update_one(
            {'id': device_id},
            {'$set': {'status': 'offline', 'last_seen': datetime.now(timezone.utc).isoformat()}}
        )
        
        # Broadcast device status to users
        await manager.broadcast_to_users({
            'type': 'device_status',
            'device_id': device_id,
            'status': 'offline'
        })

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()