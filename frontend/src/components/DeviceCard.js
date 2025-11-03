import { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Cpu, Trash2, Settings, Zap } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function DeviceCard({ device, deviceTypes, onDelete }) {
  const [controlOpen, setControlOpen] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pinNumber, setPinNumber] = useState('');

  const deviceType = deviceTypes.find((dt) => dt.id === device.device_type_id);

  const handlePinControl = async () => {
    if (!pinNumber || pinValue === '') {
      toast.error('Please enter pin and value');
      return;
    }

    try {
      await axios.post(`${API}/control/pin`, {
        device_id: device.id,
        pin: pinNumber,
        value: parseInt(pinValue) || pinValue,
      });
      toast.success(`Pin ${pinNumber} set to ${pinValue}`);
      setPinNumber('');
      setPinValue('');
    } catch (error) {
      toast.error('Failed to control pin');
    }
  };

  return (
    <Card className="p-6 hover:shadow-xl" data-testid={`device-card-${device.id}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
            <Cpu className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-lg" data-testid={`device-name-${device.id}`}>{device.name}</h3>
            <p className="text-sm text-slate-400">{deviceType?.name || 'Unknown'}</p>
          </div>
        </div>
        <Badge variant={device.status === 'online' ? 'success' : 'destructive'} data-testid={`device-status-${device.id}`}>
          {device.status}
        </Badge>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Firmware:</span>
          <span data-testid={`device-firmware-${device.id}`}>{device.firmware_version || 'N/A'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Auth Token:</span>
          <code className="text-xs bg-slate-800 px-2 py-1 rounded" data-testid={`device-token-${device.id}`}>
            {device.auth_token.substring(0, 8)}...
          </code>
        </div>
      </div>

      <div className="flex gap-2">
        <Dialog open={controlOpen} onOpenChange={setControlOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="flex-1"
              disabled={device.status === 'offline'}
              data-testid={`device-control-btn-${device.id}`}
            >
              <Zap className="w-4 h-4 mr-2" />
              Control
            </Button>
          </DialogTrigger>
          <DialogContent data-testid={`device-control-dialog-${device.id}`}>
            <DialogHeader>
              <DialogTitle>Control {device.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="pin">Pin Number</Label>
                <Input
                  id="pin"
                  placeholder="e.g., D1, A0"
                  value={pinNumber}
                  onChange={(e) => setPinNumber(e.target.value)}
                  className="mt-2"
                  data-testid="pin-input"
                />
              </div>
              <div>
                <Label htmlFor="value">Value</Label>
                <Input
                  id="value"
                  placeholder="0-255 or HIGH/LOW"
                  value={pinValue}
                  onChange={(e) => setPinValue(e.target.value)}
                  className="mt-2"
                  data-testid="value-input"
                />
              </div>
              <Button onClick={handlePinControl} className="w-full" data-testid="send-command-btn">
                Send Command
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Button
          variant="destructive"
          size="icon"
          onClick={() => onDelete(device.id)}
          data-testid={`device-delete-btn-${device.id}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}