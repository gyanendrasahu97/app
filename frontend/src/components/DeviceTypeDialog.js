import { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Plus } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function DeviceTypeDialog({ onDeviceTypeAdded }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name) {
      toast.error('Device type name is required');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/device-types`, {
        name,
        description,
        pins_config: [],
      });
      toast.success('Device type added successfully!');
      setName('');
      setDescription('');
      onDeviceTypeAdded();
    } catch (error) {
      toast.error('Failed to add device type');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h3 className="text-xl font-semibold mb-6">Add Device Type</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="dt-name">Device Type Name</Label>
          <Input
            id="dt-name"
            placeholder="e.g., ESP32, Arduino Uno"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-2"
            data-testid="device-type-name-input"
          />
        </div>
        <div>
          <Label htmlFor="dt-description">Description (Optional)</Label>
          <Textarea
            id="dt-description"
            placeholder="Describe this device type"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-2"
            data-testid="device-type-desc-input"
          />
        </div>
        <Button type="submit" disabled={loading} data-testid="device-type-submit-btn">
          <Plus className="w-4 h-4 mr-2" />
          {loading ? 'Adding...' : 'Add Device Type'}
        </Button>
      </form>
    </div>
  );
}