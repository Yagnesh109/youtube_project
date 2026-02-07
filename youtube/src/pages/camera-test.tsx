import React, { useState, useRef, useEffect } from 'react';
import { Camera, CameraOff, RefreshCw, AlertCircle } from 'lucide-react';

const CameraTest: React.FC = () => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [streamInfo, setStreamInfo] = useState<any>({});

  const videoRef = useRef<HTMLVideoElement>(null);

  // Get available devices
  const getDevices = async () => {
    try {
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = deviceList.filter(device => device.kind === 'videoinput');
      setDevices(videoDevices);
      
      if (videoDevices.length > 0 && !selectedDevice) {
        setSelectedDevice(videoDevices[0].deviceId);
      }
      
      console.log('Available video devices:', videoDevices);
    } catch (err) {
      console.error('Error getting devices:', err);
      setError('Failed to get camera devices');
    }
  };

  // Start camera
  const startCamera = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const constraints: MediaStreamConstraints = {
        video: selectedDevice ? 
          { 
            deviceId: { exact: selectedDevice },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          } : 
          { 
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
        audio: false
      };

      console.log('Requesting stream with constraints:', constraints);
      
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Get stream info
      const videoTrack = mediaStream.getVideoTracks()[0];
      const settings = videoTrack?.getSettings();
      const capabilities = videoTrack?.getCapabilities();
      
      setStreamInfo({
        trackLabel: videoTrack?.label || 'Unknown',
        settings: settings,
        capabilities: capabilities,
        muted: videoTrack?.muted,
        enabled: videoTrack?.enabled
      });
      
      console.log('Stream info:', {
        trackLabel: videoTrack?.label,
        settings,
        capabilities
      });
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      
    } catch (err: any) {
      console.error('Error accessing camera:', err);
      
      let errorMessage = 'Unknown error occurred';
      
      switch (err.name) {
        case 'NotAllowedError':
          errorMessage = 'Camera permission denied. Please allow camera access in your browser settings and reload the page.';
          break;
        case 'NotFoundError':
          errorMessage = 'No camera found. Please connect a camera and try again.';
          break;
        case 'NotReadableError':
          errorMessage = 'Camera is already in use by another application (like Smart Connect App, Zoom, Teams, etc.). Please close other apps and try again.';
          break;
        case 'OverconstrainedError':
          errorMessage = 'Camera does not support the requested settings.';
          break;
        case 'TypeError':
          errorMessage = 'Camera constraints are not supported.';
          break;
        default:
          errorMessage = `Camera error: ${err.message || err.name}`;
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setStreamInfo({});
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // Switch camera
  const switchCamera = async (deviceId: string) => {
    setSelectedDevice(deviceId);
    if (stream) {
      stopCamera();
      // Auto-start with new device
      setTimeout(() => startCamera(), 100);
    }
  };

  // Initialize devices on mount
  useEffect(() => {
    getDevices();
    
    // Listen for device changes
    const handleDeviceChange = () => {
      console.log('Device change detected');
      getDevices();
    };
    
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      stopCamera();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
          <Camera className="w-8 h-8" />
          Camera Test & Debug
        </h1>

        {/* Error Display */}
        {error && (
          <div className="bg-red-600 border border-red-700 text-white p-4 rounded-lg mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Camera Error</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Device Selection */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Camera Devices</h2>
          
          {devices.length === 0 ? (
            <p className="text-gray-400">No cameras detected</p>
          ) : (
            <div className="space-y-3">
              {devices.map((device) => (
                <div
                  key={device.deviceId}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedDevice === device.deviceId
                      ? 'bg-blue-600 border-blue-500'
                      : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                  }`}
                  onClick={() => switchCamera(device.deviceId)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                      </p>
                      <p className="text-sm text-gray-400">
                        ID: {device.deviceId}
                      </p>
                    </div>
                    {selectedDevice === device.deviceId && (
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <button
            onClick={getDevices}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Devices
          </button>
        </div>

        {/* Video Preview */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Camera Preview</h2>
          
          <div className="relative bg-black rounded-lg overflow-hidden mb-4" style={{ aspectRatio: '16/9' }}>
            {stream ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <CameraOff className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Camera not active</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-4">
            {!stream ? (
              <button
                onClick={startCamera}
                disabled={isLoading}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg transition-colors"
              >
                {isLoading ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <Camera className="w-5 h-5" />
                )}
                {isLoading ? 'Starting Camera...' : 'Start Camera'}
              </button>
            ) : (
              <button
                onClick={stopCamera}
                className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                <CameraOff className="w-5 h-5" />
                Stop Camera
              </button>
            )}
          </div>
        </div>

        {/* Stream Information */}
        {streamInfo.trackLabel && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Stream Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-400">Track Label</p>
                <p className="font-mono">{streamInfo.trackLabel}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-400">Enabled</p>
                <p className="font-mono">{streamInfo.enabled ? 'Yes' : 'No'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-400">Muted</p>
                <p className="font-mono">{streamInfo.muted ? 'Yes' : 'No'}</p>
              </div>
              
              {streamInfo.settings && (
                <>
                  <div>
                    <p className="text-sm text-gray-400">Resolution</p>
                    <p className="font-mono">
                      {streamInfo.settings.width} × {streamInfo.settings.height}
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-400">Frame Rate</p>
                    <p className="font-mono">{streamInfo.settings.frameRate} fps</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-400">Facing Mode</p>
                    <p className="font-mono">{streamInfo.settings.facingMode || 'Unknown'}</p>
                  </div>
                </>
              )}
            </div>
            
            {streamInfo.capabilities && (
              <div className="mt-4">
                <p className="text-sm text-gray-400 mb-2">Capabilities</p>
                <pre className="bg-gray-900 p-3 rounded text-xs overflow-x-auto">
                  {JSON.stringify(streamInfo.capabilities, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Troubleshooting Tips */}
        <div className="bg-gray-800 rounded-lg p-6 mt-6">
          <h2 className="text-xl font-semibold mb-4">Troubleshooting Tips</h2>
          
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 text-xs">1</div>
              <div>
                <p className="font-medium">Check Camera Permissions</p>
                <p className="text-gray-400">Make sure you allow camera access when prompted by the browser</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 text-xs">2</div>
              <div>
                <p className="font-medium">Close Other Apps</p>
                <p className="text-gray-400">Close Smart Connect App, Zoom, Teams, or other apps using your camera</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 text-xs">3</div>
              <div>
                <p className="font-medium">Try Different Browser</p>
                <p className="text-gray-400">Test with Chrome, Edge, or Firefox for best compatibility</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 text-xs">4</div>
              <div>
                <p className="font-medium">Check Physical Camera</p>
                <p className="text-gray-400">Make sure your camera is connected and not covered</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CameraTest;
