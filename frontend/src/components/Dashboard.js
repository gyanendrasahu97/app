import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import DeviceCard from './DeviceCard';
import AddDeviceDialog from './AddDeviceDialog';
import FirmwareDialog from './FirmwareDialog';
import DeviceTypeDialog from './DeviceTypeDialog';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Activity, Cpu, Upload, LogOut, Settings } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const WS_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');

export default function Dashboard({ user, onLogout }) {
  const [devices, setDevices] = useState([]);
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    fetchDeviceTypes();
    fetchDevices();
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const connectWebSocket = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_URL}/ws/dashboard/${user?.id || 'user'}`);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setWsConnected(false);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setWsConnected(false);
      // Reconnect after 3 seconds
      setTimeout(connectWebSocket, 3000);
    };

    wsRef.current = ws;
  };

  const handleWebSocketMessage = (message) => {
    switch (message.type) {
      case 'device_status':
        setDevices((prev) =>
          prev.map((d) =>
            d.id === message.device_id ? { ...d, status: message.status } : d
          )
        );
        toast.info(`Device ${message.status}`);
        break;

      case 'sensor_data':
        console.log('Sensor data received:', message.data);
        break;

      case 'firmware_update_status':
        toast.success(`Firmware updated to ${message.version}`);
        fetchDevices();
        break;

      default:
        break;
    }
  };

  const fetchDevices = async () => {
    try {
      const response = await axios.get(`${API}/devices`);
      setDevices(response.data);
    } catch (error) {
      toast.error('Failed to fetch devices');
    } finally {
      setLoading(false);
    }
  };

  const fetchDeviceTypes = async () => {
    try {
      const response = await axios.get(`${API}/device-types`);
      setDeviceTypes(response.data);
    } catch (error) {
      console.error('Failed to fetch device types:', error);
    }
  };

  const handleDeviceAdded = () => {
    fetchDevices();
  };

  const handleDeviceTypeAdded = () => {
    fetchDeviceTypes();
  };

  const handleDeleteDevice = async (deviceId) => {
    try {
      await axios.delete(`${API}/devices/${deviceId}`);
      toast.success('Device deleted');
      fetchDevices();
    } catch (error) {
      toast.error('Failed to delete device');
    }
  };

  const onlineDevices = devices.filter((d) => d.status === 'online').length;
  const offlineDevices = devices.filter((d) => d.status === 'offline').length;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              IoT Dashboard
            </h1>
            <p className="text-slate-400">Welcome back, {user?.username || 'User'}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 glass-effect rounded-lg">
              <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm" data-testid="ws-status">{wsConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
            <Button variant="outline" onClick={onLogout} data-testid="logout-btn">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="glass-effect rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm mb-1">Total Devices</p>
                <p className="text-3xl font-bold" data-testid="total-devices">{devices.length}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Cpu className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </div>

          <div className="glass-effect rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm mb-1">Online</p>
                <p className="text-3xl font-bold text-green-400" data-testid="online-devices">{onlineDevices}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <Activity className="w-6 h-6 text-green-400" />
              </div>
            </div>
          </div>

          <div className="glass-effect rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm mb-1">Offline</p>
                <p className="text-3xl font-bold text-red-400" data-testid="offline-devices">{offlineDevices}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <Activity className="w-6 h-6 text-red-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="devices" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="devices" data-testid="devices-tab">Devices</TabsTrigger>
            <TabsTrigger value="firmware" data-testid="firmware-tab">Firmware</TabsTrigger>
            <TabsTrigger value="settings" data-testid="settings-tab">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="devices" data-testid="devices-content">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold">Your Devices</h2>
              <AddDeviceDialog
                deviceTypes={deviceTypes}
                onDeviceAdded={handleDeviceAdded}
              />
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="loader"></div>
              </div>
            ) : devices.length === 0 ? (
              <div className="glass-effect rounded-2xl p-12 text-center">
                <Cpu className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <h3 className="text-xl font-semibold mb-2">No devices yet</h3>
                <p className="text-slate-400 mb-6">Add your first Arduino device to get started</p>
                <AddDeviceDialog
                  deviceTypes={deviceTypes}
                  onDeviceAdded={handleDeviceAdded}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {devices.map((device) => (
                  <DeviceCard
                    key={device.id}
                    device={device}
                    deviceTypes={deviceTypes}
                    onDelete={handleDeleteDevice}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="firmware" data-testid="firmware-content">
            <FirmwareDialog deviceTypes={deviceTypes} devices={devices} />
          </TabsContent>

          <TabsContent value="settings" data-testid="settings-content">
            <div className="glass-effect rounded-2xl p-8">
              <h2 className="text-2xl font-semibold mb-6">Settings</h2>
              <DeviceTypeDialog onDeviceTypeAdded={handleDeviceTypeAdded} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}