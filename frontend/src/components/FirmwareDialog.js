import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Card } from './ui/card';
import { Upload, Download, RefreshCw } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function FirmwareDialog({ deviceTypes, devices }) {
  const [selectedDeviceType, setSelectedDeviceType] = useState('');
  const [firmwareVersions, setFirmwareVersions] = useState([]);
  const [file, setFile] = useState(null);
  const [version, setVersion] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (selectedDeviceType) {
      fetchFirmwareVersions(selectedDeviceType);
    }
  }, [selectedDeviceType]);

  const fetchFirmwareVersions = async (deviceTypeId) => {
    try {
      const response = await axios.get(`${API}/firmware/${deviceTypeId}`);
      setFirmwareVersions(response.data);
    } catch (error) {
      console.error('Failed to fetch firmware versions');
    }
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async (e) => {
    e.preventDefault();

    if (!file || !version || !selectedDeviceType) {
      toast.error('Please fill all required fields');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('device_type_id', selectedDeviceType);
    formData.append('version', version);
    formData.append('description', description);
    formData.append('file', file);

    try {
      await axios.post(`${API}/firmware/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Firmware uploaded successfully!');
      setFile(null);
      setVersion('');
      setDescription('');
      fetchFirmwareVersions(selectedDeviceType);
    } catch (error) {
      toast.error('Failed to upload firmware');
    } finally {
      setUploading(false);
    }
  };

  const handleOTA = async (deviceId, firmwareId) => {
    try {
      await axios.post(`${API}/firmware/ota/${deviceId}/${firmwareId}`);
      toast.success('OTA update initiated!');
    } catch (error) {
      toast.error('Failed to initiate OTA update');
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <Card className="p-6" data-testid="firmware-upload-section">
        <h3 className="text-xl font-semibold mb-4">Upload Firmware</h3>
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <Label htmlFor="fw-device-type">Device Type</Label>
            <Select value={selectedDeviceType} onValueChange={setSelectedDeviceType}>
              <SelectTrigger className="mt-2" data-testid="fw-device-type-select">
                <SelectValue placeholder="Select device type" />
              </SelectTrigger>
              <SelectContent>
                {deviceTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="fw-version">Version</Label>
            <Input
              id="fw-version"
              placeholder="e.g., 1.0.1"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="mt-2"
              data-testid="fw-version-input"
            />
          </div>

          <div>
            <Label htmlFor="fw-description">Description (Optional)</Label>
            <Textarea
              id="fw-description"
              placeholder="What's new in this version?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-2"
              data-testid="fw-description-input"
            />
          </div>

          <div>
            <Label htmlFor="fw-file">Firmware File (.bin)</Label>
            <Input
              id="fw-file"
              type="file"
              accept=".bin"
              onChange={handleFileChange}
              className="mt-2"
              data-testid="fw-file-input"
            />
          </div>

          <Button type="submit" disabled={uploading} className="w-full" data-testid="fw-upload-btn">
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? 'Uploading...' : 'Upload Firmware'}
          </Button>
        </form>
      </Card>

      {/* Firmware Versions */}
      {selectedDeviceType && firmwareVersions.length > 0 && (
        <Card className="p-6" data-testid="firmware-versions-section">
          <h3 className="text-xl font-semibold mb-4">Available Versions</h3>
          <div className="space-y-3">
            {firmwareVersions.map((fw) => (
              <div
                key={fw.id}
                className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg"
                data-testid={`firmware-version-${fw.id}`}
              >
                <div>
                  <p className="font-semibold" data-testid={`fw-version-name-${fw.id}`}>v{fw.version}</p>
                  <p className="text-sm text-slate-400" data-testid={`fw-version-desc-${fw.id}`}>{fw.description || 'No description'}</p>
                  <p className="text-xs text-slate-500">Size: {(fw.file_size / 1024).toFixed(2)} KB</p>
                </div>
                <div className="flex gap-2">
                  <Select
                    onValueChange={(deviceId) => handleOTA(deviceId, fw.id)}
                  >
                    <SelectTrigger className="w-[200px]" data-testid={`ota-device-select-${fw.id}`}>
                      <SelectValue placeholder="Push to device" />
                    </SelectTrigger>
                    <SelectContent>
                      {devices
                        .filter((d) => d.device_type_id === selectedDeviceType)
                        .map((device) => (
                          <SelectItem key={device.id} value={device.id}>
                            {device.name} ({device.status})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}