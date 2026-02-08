import React, { useState } from 'react';
import { Settings, Monitor, Camera, Users, Download } from 'lucide-react';

interface RecordingOptionsProps {
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  recordingMode: 'camera-only' | 'screen-only' | 'combined' | 'picture-in-picture';
  onRecordingModeChange: (mode: 'camera-only' | 'screen-only' | 'combined' | 'picture-in-picture') => void;
}

const RecordingOptions: React.FC<RecordingOptionsProps> = ({
  isRecording,
  onStartRecording,
  onStopRecording,
  recordingMode,
  onRecordingModeChange
}) => {
  const [showOptions, setShowOptions] = useState(false);

  const recordingModes = [
    {
      value: 'camera-only',
      label: 'Camera Only',
      description: 'Record your camera feed only',
      icon: Camera,
      color: 'bg-blue-600'
    },
    {
      value: 'screen-only',
      label: 'Screen Only',
      description: 'Record your screen share only',
      icon: Monitor,
      color: 'bg-green-600'
    },
    {
      value: 'combined',
      label: 'Combined',
      description: 'Record camera and screen side by side',
      icon: Users,
      color: 'bg-purple-600'
    },
    {
      value: 'picture-in-picture',
      label: 'Picture-in-Picture',
      description: 'Screen with camera overlay',
      icon: Monitor,
      color: 'bg-orange-600'
    }
  ];

  const currentMode = recordingModes.find(mode => mode.value === recordingMode);

  return (
    <div className="relative flex items-center gap-2">
      <button
        onClick={isRecording ? onStopRecording : onStartRecording}
        className={`p-4 rounded-full transition-colors ${
          isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
        } text-white relative`}
      >
        {isRecording ? (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
            <span className="text-xs font-medium">REC</span>
          </div>
        ) : (
          <Download className="w-6 h-6" />
        )}

        {!isRecording && currentMode && (
          <div className={`absolute -top-1 -right-1 w-3 h-3 ${currentMode.color} rounded-full`}></div>
        )}
      </button>

      {!isRecording && (
        <button
          onClick={() => setShowOptions((prev) => !prev)}
          className="p-3 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-colors"
          title="Recording options"
        >
          <Settings className="w-4 h-4" />
        </button>
      )}

      {!isRecording && showOptions && (
        <div className="absolute bottom-full right-0 mb-2 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50">
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-gray-400" />
              <span className="text-white font-medium">Recording Options</span>
            </div>
            <button
              onClick={() => setShowOptions(false)}
              className="text-gray-400 hover:text-white"
            >
              x
            </button>
          </div>

          <div className="p-4 border-b border-gray-700">
            <div className="flex items-center gap-3">
              {currentMode && <currentMode.icon className="w-5 h-5 text-gray-400" />}
              <div>
                <p className="text-white font-medium">{currentMode?.label}</p>
                <p className="text-gray-400 text-sm">{currentMode?.description}</p>
              </div>
            </div>
          </div>

          <div className="p-2">
            {recordingModes.map((mode) => (
              <button
                key={mode.value}
                onClick={() => {
                  onRecordingModeChange(mode.value as any);
                  setShowOptions(false);
                }}
                className={`w-full p-3 rounded-lg flex items-center gap-3 transition-colors ${
                  recordingMode === mode.value
                    ? 'bg-gray-800 border border-gray-600'
                    : 'hover:bg-gray-800'
                }`}
              >
                <div className={`w-8 h-8 ${mode.color} rounded-lg flex items-center justify-center`}>
                  <mode.icon className="w-4 h-4 text-white" />
                </div>
                <div className="text-left">
                  <p className="text-white font-medium">{mode.label}</p>
                  <p className="text-gray-400 text-sm">{mode.description}</p>
                </div>
                {recordingMode === mode.value && (
                  <div className="ml-auto w-2 h-2 bg-green-500 rounded-full"></div>
                )}
              </button>
            ))}
          </div>

          <div className="p-4 border-t border-gray-700">
            <p className="text-gray-400 text-sm">
              Tip: Picture-in-Picture mode records your screen with your camera overlay.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecordingOptions;
