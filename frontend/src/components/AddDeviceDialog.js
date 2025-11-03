import { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Plus } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AddDeviceDialog({ deviceTypes, onDeviceAdded }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [deviceTypeId, setDeviceTypeId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name || !deviceTypeId) {
      toast.error('Please fill all fields');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/devices`, {
        name,
        device_type_id: deviceTypeId,
      });
      toast.success('Device added successfully!');
      setName('');
      setDeviceTypeId('');
      setOpen(false);
      onDeviceAdded();
    } catch (error) {
      toast.error('Failed to add device');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="add-device-btn">
          <Plus className="w-4 h-4 mr-2" />
          Add Device
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="add-device-dialog">
        <DialogHeader>
          <DialogTitle>Add New Device</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div>
            <Label htmlFor="device-name">Device Name</Label>
            <Input
              id="device-name"
              placeholder="My Arduino"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2"
              data-testid="device-name-input"
            />
          </div>
          <div>
            <Label htmlFor="device-type">Device Type</Label>
            <Select value={deviceTypeId} onValueChange={setDeviceTypeId}>
              <SelectTrigger className="mt-2" data-testid="device-type-select">
                <SelectValue placeholder="Select device type" />
              </SelectTrigger>
              <SelectContent>
                {deviceTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id} data-testid={`device-type-option-${type.id}`}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={loading} data-testid="add-device-submit-btn">
            {loading ? 'Adding...' : 'Add Device'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}