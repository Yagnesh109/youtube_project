import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Phone,
  PhoneOff,
  Monitor,
  Square,
  Users,
  Video,
  VideoOff,
  Mic,
  MicOff,
} from "lucide-react";
import SignalingService, { getSignalingService } from "@/services/SignalingService";
import CombinedRecorder, { CombinedRecorderHandle } from "./CombinedRecorder";
import RecordingOptions from "./RecordingOptions";
import { saveRecording } from "@/lib/recordings";

interface VideoCallProps {
  callId?: string;
  userId?: string;
  targetUserId?: string;
  incomingOffer?: RTCSessionDescriptionInit | null;
  incomingFromUserId?: string | null;
  signalingService?: SignalingService | null;
  autoStart?: boolean;
  onEndCall?: () => void;
  onHide?: () => void;
  isHidden?: boolean;
}

const VideoCall: React.FC<VideoCallProps> = ({
  callId,
  userId,
  targetUserId,
  incomingOffer,
  incomingFromUserId,
  signalingService,
  autoStart = true,
  onEndCall,
  onHide,
  isHidden = false,
}) => {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [cameraError, setCameraError] = useState<string>("");
  const [screenShareError, setScreenShareError] = useState<string>("");
  const [recordingMode, setRecordingMode] = useState<
    "camera-only" | "screen-only" | "combined" | "picture-in-picture"
  >("combined");
  const [localPreviewPos, setLocalPreviewPos] = useState({ x: 0, y: 0 });
  const [isPipActive, setIsPipActive] = useState(false);
  const dragStateRef = useRef<{
    dragging: boolean;
    offsetX: number;
    offsetY: number;
  }>({ dragging: false, offsetX: 0, offsetY: 0 });
  const isCallActiveRef = useRef(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const screenShareRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<CombinedRecorderHandle | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const callStartTimeRef = useRef<Date | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const signalingRef = useRef<SignalingService | null>(signalingService || null);
  const remoteUserIdRef = useRef<string | null>(null);
  const outgoingStartedRef = useRef(false);
  const incomingHandledRef = useRef(false);
  const skipCleanupOnceRef = useRef(true);
  const remoteDescriptionSetRef = useRef(false);
  const lastOfferSdpRef = useRef<string | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);

  // WebRTC configuration (STUN + optional TURN)
  const configuration = (() => {
    const iceServers: RTCIceServer[] = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ];

    const turnUrls =
      (process.env.NEXT_PUBLIC_TURN_URLS || "")
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean) || [];

    if (turnUrls.length > 0) {
      iceServers.push({
        urls: turnUrls,
        username: process.env.NEXT_PUBLIC_TURN_USERNAME || "",
        credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || "",
      });
    }

    return { iceServers };
  })();

  // Get available cameras
  const getAvailableCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((device) => device.kind === "videoinput");
      setAvailableCameras(cameras);

      if (cameras.length > 0 && !selectedCamera) {
        setSelectedCamera(cameras[0].deviceId);
      }

      return cameras;
    } catch (error) {
      console.error("Error enumerating cameras:", error);
      setCameraError("Failed to get camera devices");
      return [];
    }
  }, [selectedCamera]);

  // Initialize local media stream with device selection
  const initializeLocalStream = useCallback(async () => {
    try {
      setCameraError("");
      await getAvailableCameras();

      const constraints: MediaStreamConstraints = {
        video: selectedCamera
          ? {
              deviceId: { exact: selectedCamera },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : {
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
        audio: true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.onloadedmetadata = () => {
          localVideoRef.current?.play().catch(() => null);
        };
      }

      return stream;
    } catch (error: any) {
      console.error("Error accessing media devices:", error);
      if (error.name === "NotAllowedError") {
        setCameraError(
          "Camera permission denied. Please allow camera access in your browser settings."
        );
      } else if (error.name === "NotFoundError") {
        setCameraError("No camera found. Please connect a camera and try again.");
      } else if (error.name === "NotReadableError") {
        setCameraError(
          "Camera is already in use by another application (like Smart Connect App)."
        );
      } else if (error.name === "OverconstrainedError") {
        setCameraError("Camera does not support the requested constraints.");
      } else {
        setCameraError(`Camera error: ${error.message || "Unknown error"}`);
      }
      throw error;
    }
  }, [selectedCamera, getAvailableCameras]);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(configuration);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      remoteStreamRef.current = remoteStream;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && signalingRef.current && userId && remoteUserIdRef.current) {
        signalingRef.current.sendIceCandidate(
          remoteUserIdRef.current,
          event.candidate.toJSON(),
          userId
        );
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setConnectionStatus("connected");
      } else if (pc.connectionState === "connecting") {
        setConnectionStatus("connecting");
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        setConnectionStatus("disconnected");
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [userId]);

  const flushPendingIce = useCallback(async () => {
    if (!peerConnectionRef.current || pendingIceRef.current.length === 0) return;
    const candidates = [...pendingIceRef.current];
    pendingIceRef.current = [];
    for (const candidate of candidates) {
      try {
        await peerConnectionRef.current.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } catch (error) {
        console.error("Error adding buffered ICE candidate:", error);
      }
    }
  }, []);

  const replaceVideoTrack = useCallback(async (track: MediaStreamTrack) => {
    if (!peerConnectionRef.current) return;
    const sender = peerConnectionRef.current
      .getSenders()
      .find((s) => s.track && s.track.kind === "video");
    if (sender) {
      await sender.replaceTrack(track);
    }
  }, []);

  // Start screen sharing
  const startScreenShare = useCallback(async () => {
    try {
      setScreenShareError("");
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      screenStreamRef.current = screenStream;

      const videoTrack = screenStream.getVideoTracks()[0];
      if (videoTrack) {
        await replaceVideoTrack(videoTrack);
      }

      if (screenShareRef.current) {
        screenShareRef.current.srcObject = screenStream;
      }

      setIsScreenSharing(true);

      videoTrack.onended = () => {
        stopScreenShare();
      };
    } catch (error) {
      console.error("Error starting screen share:", error);
      setScreenShareError("Unable to start screen sharing.");
    }
  }, [replaceVideoTrack]);

  // Start app tab sharing (YouTube clone)
  const startYouTubeShare = useCallback(async () => {
    try {
      setScreenShareError("");
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser",
        } as MediaTrackConstraints,
        audio: true,
      });

      const videoTrack = screenStream.getVideoTracks()[0];
      const label = videoTrack?.label?.toLowerCase() || "";
      const allowedDomain =
        (process.env.NEXT_PUBLIC_SHARE_DOMAIN || "localhost:3000").toLowerCase();
      if (label && !label.includes(allowedDomain)) {
        setScreenShareError(
          "Tip: pick your YouTube clone tab (localhost:3000) for shared viewing."
        );
      } else {
        setScreenShareError("");
      }

      screenStreamRef.current = screenStream;
      if (videoTrack) {
        await replaceVideoTrack(videoTrack);
      }

      if (screenShareRef.current) {
        screenShareRef.current.srcObject = screenStream;
      }

      setIsScreenSharing(true);

      videoTrack.onended = () => {
        stopScreenShare();
      };
    } catch (error) {
      console.error("Error starting YouTube share:", error);
      setScreenShareError("Unable to share app tab.");
    }
  }, [replaceVideoTrack]);

  // Stop screen sharing
  const stopScreenShare = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }

    if (peerConnectionRef.current && localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        replaceVideoTrack(videoTrack);
      }
    }

    if (screenShareRef.current) {
      screenShareRef.current.srcObject = null;
    }

    setIsScreenSharing(false);
  }, [replaceVideoTrack]);

  const startRecording = useCallback(() => {
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
  }, []);

  const handleRecordingComplete = useCallback(async (blob: Blob) => {
    const filename = `call-recording-${new Date().toISOString()}.webm`;
    try {
      await saveRecording(blob, filename);
    } catch (error) {
      console.error("Failed to save recording to local storage:", error);
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  }, [isVideoOff]);

  // Initialize cameras on component mount
  useEffect(() => {
    getAvailableCameras();

    const handleDeviceChange = () => {
      getAvailableCameras();
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [getAvailableCameras]);

  // Switch camera
  const switchCamera = useCallback(async (deviceId: string) => {
    if (!localStreamRef.current) return;

    try {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.stop();
      }

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });

      const newVideoTrack = newStream.getVideoTracks()[0];

      if (peerConnectionRef.current) {
        const sender = peerConnectionRef.current.getSenders().find(
          (s) => s.track && s.track.kind === "video"
        );

        if (sender) {
          await sender.replaceTrack(newVideoTrack);
        }
      }

      if (videoTrack) {
        localStreamRef.current.removeTrack(videoTrack);
      }
      localStreamRef.current.addTrack(newVideoTrack);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      setSelectedCamera(deviceId);
    } catch (error) {
      console.error("Error switching camera:", error);
      setCameraError("Failed to switch camera");
    }
  }, []);

  const startCallTimer = useCallback(() => {
    callStartTimeRef.current = new Date();
    durationIntervalRef.current = setInterval(() => {
      if (callStartTimeRef.current) {
        const duration = Math.floor(
          (Date.now() - callStartTimeRef.current.getTime()) / 1000
        );
        setCallDuration(duration);
      }
    }, 1000);
  }, []);

  const stopCallTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  const startCall = useCallback(async () => {
    if (!targetUserId || !userId) return;

    try {
      remoteDescriptionSetRef.current = false;
      setConnectionStatus("connecting");
      remoteUserIdRef.current = targetUserId;

      await initializeLocalStream();
      const pc = createPeerConnection();

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      signalingRef.current?.initiateCall(targetUserId, offer, userId);

      startCallTimer();
      setIsCallActive(true);
    } catch (error) {
      console.error("Error starting call:", error);
      setConnectionStatus("disconnected");
    }
  }, [initializeLocalStream, createPeerConnection, startCallTimer, targetUserId, userId]);

  const acceptIncomingCall = useCallback(async () => {
    if (!incomingOffer || !incomingFromUserId || !userId) return;
    if (incomingHandledRef.current) return;
    incomingHandledRef.current = true;
    if (incomingOffer.sdp && lastOfferSdpRef.current === incomingOffer.sdp) {
      return;
    }
    lastOfferSdpRef.current = incomingOffer.sdp || null;

    try {
      remoteDescriptionSetRef.current = false;
      setConnectionStatus("connecting");
      remoteUserIdRef.current = incomingFromUserId;

      await initializeLocalStream();
      const pc = createPeerConnection();

      await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      remoteDescriptionSetRef.current = true;
      await flushPendingIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      signalingRef.current?.answerCall(incomingFromUserId, answer, userId);

      startCallTimer();
      setIsCallActive(true);
    } catch (error) {
      console.error("Error answering call:", error);
      setConnectionStatus("disconnected");
    }
  }, [
    incomingOffer,
    incomingFromUserId,
    userId,
    initializeLocalStream,
    createPeerConnection,
    startCallTimer,
  ]);

  // End call
  const endCall = useCallback(
    (remoteEnded = false, reason: string = "unknown") => {
      console.log("Ending call", remoteEnded, reason);
      const shouldNotifyRemote = reason === "user-click";
      if (
        shouldNotifyRemote &&
        signalingRef.current &&
        userId &&
        remoteUserIdRef.current
      ) {
        signalingRef.current.endCall(remoteUserIdRef.current, userId);
      }

      if (isRecording) {
        recorderRef.current?.stop();
        setIsRecording(false);
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (remoteStreamRef.current) {
        remoteStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }

      stopCallTimer();

      setIsCallActive(false);
      setIsScreenSharing(false);
      setCallDuration(0);
      setConnectionStatus("disconnected");

      localStreamRef.current = null;
      remoteStreamRef.current = null;
      screenStreamRef.current = null;
      peerConnectionRef.current = null;
      remoteUserIdRef.current = null;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      if (screenShareRef.current) {
        screenShareRef.current.srcObject = null;
      }

      const shouldCloseUi =
        reason === "user-click" || reason === "remote-end" || reason === "remote-reject";
      if (shouldCloseUi && onEndCall) {
        onEndCall();
      }
    },
    [onEndCall, stopCallTimer, userId, isRecording]
  );

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  // Signaling setup
  useEffect(() => {
    if (!userId) return;
    if (!signalingRef.current) {
      signalingRef.current = getSignalingService();
    }
    signalingRef.current.setUserId(userId);

    const handleAnswer = async ({ answer }: any) => {
      if (!peerConnectionRef.current) return;
      if (remoteDescriptionSetRef.current) return;
      try {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
        remoteDescriptionSetRef.current = true;
        await flushPendingIce();
      } catch (error) {
        console.error("Error setting remote description:", error);
      }
    };

    const handleIce = async ({ candidate }: any) => {
      if (!peerConnectionRef.current) return;
      if (!peerConnectionRef.current.remoteDescription) {
        pendingIceRef.current.push(candidate);
        return;
      }
      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("Error adding ICE candidate:", error);
      }
    };

    const handleEnd = () => {
      endCall(true, "remote-end");
    };

    const handleReject = () => {
      endCall(true, "remote-reject");
    };

    signalingRef.current.on("call:answer", handleAnswer);
    signalingRef.current.on("ice-candidate", handleIce);
    signalingRef.current.on("call:end", handleEnd);
    signalingRef.current.on("call:reject", handleReject);

    return () => {
      signalingRef.current?.off("call:answer", handleAnswer);
      signalingRef.current?.off("ice-candidate", handleIce);
      signalingRef.current?.off("call:end", handleEnd);
      signalingRef.current?.off("call:reject", handleReject);
    };
  }, [userId, endCall]);

  useEffect(() => {
    if (incomingOffer && incomingFromUserId && !isCallActive) {
      acceptIncomingCall();
    }
  }, [incomingOffer, incomingFromUserId, isCallActive, acceptIncomingCall]);

  useEffect(() => {
    // Reset incoming guard when a new caller arrives
    incomingHandledRef.current = false;
  }, [incomingFromUserId]);

  useEffect(() => {
    if (
      autoStart &&
      targetUserId &&
      !incomingOffer &&
      !isCallActive &&
      !outgoingStartedRef.current
    ) {
      outgoingStartedRef.current = true;
      startCall();
    }
  }, [autoStart, targetUserId, incomingOffer, isCallActive, startCall]);

  useEffect(() => {
    isCallActiveRef.current = isCallActive;
  }, [isCallActive]);

  useEffect(() => {
    return () => {
      // React 18 StrictMode runs effect cleanup once on mount in dev.
      // Skip the first cleanup to avoid ending calls immediately.
      if (process.env.NODE_ENV === "development") {
        return;
      }
      if (skipCleanupOnceRef.current) {
        skipCleanupOnceRef.current = false;
        return;
      }
      if (isCallActiveRef.current) {
        endCall(true, "cleanup");
      }
    };
  }, [endCall]);

  useEffect(() => {
    setLocalPreviewPos({ x: 16, y: 16 });
  }, []);

  useEffect(() => {
    const handleLeavePip = () => setIsPipActive(false);
    // @ts-ignore
    document.addEventListener("leavepictureinpicture", handleLeavePip);
    return () => {
      // @ts-ignore
      document.removeEventListener("leavepictureinpicture", handleLeavePip);
    };
  }, []);

  const handleLocalPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      dragging: true,
      offsetX: event.clientX - localPreviewPos.x,
      offsetY: event.clientY - localPreviewPos.y,
    };
  };

  const handleLocalPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.dragging) return;
    setLocalPreviewPos({
      x: event.clientX - dragStateRef.current.offsetX,
      y: event.clientY - dragStateRef.current.offsetY,
    });
  };

  const handleLocalPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragStateRef.current.dragging = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const togglePictureInPicture = useCallback(async () => {
    try {
      const targetVideo =
        (remoteVideoRef.current && remoteStreamRef.current) ||
        localVideoRef.current
          ? (remoteVideoRef.current && remoteStreamRef.current
              ? remoteVideoRef.current
              : localVideoRef.current)
          : null;

      if (!targetVideo) return;

      // @ts-ignore - pictureInPictureElement is not in older TS libs
      if (document.pictureInPictureElement) {
        // @ts-ignore
        await document.exitPictureInPicture();
        setIsPipActive(false);
        return;
      }

      if (document.pictureInPictureEnabled) {
        await targetVideo.requestPictureInPicture();
        setIsPipActive(true);
      }
    } catch (error) {
      console.error("Picture-in-Picture error:", error);
    }
  }, []);

  return (
    <div
      className={`fixed inset-0 bg-black z-50 flex flex-col transition-opacity ${
        isHidden ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      aria-hidden={isHidden}
    >
      <div className="bg-gray-900 p-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Users className="w-6 h-6 text-white" />
          <div>
            <h2 className="text-white font-semibold">Video Call</h2>
            <p className="text-gray-400 text-sm">
              Status: {connectionStatus} | Duration: {formatDuration(callDuration)}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {isRecording && (
            <div className="flex items-center space-x-2 bg-red-600 px-3 py-1 rounded-full">
              <Square className="w-4 h-4 text-white" />
              <span className="text-white text-sm">Recording</span>
            </div>
          )}
          {isScreenSharing && (
            <div className="flex items-center space-x-2 bg-blue-600 px-3 py-1 rounded-full">
              <Monitor className="w-4 h-4 text-white" />
              <span className="text-white text-sm">Screen Sharing</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 relative bg-gray-800">
        <div className="absolute inset-0">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          {connectionStatus === "disconnected" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">Waiting for connection...</p>
              </div>
            </div>
          )}
        </div>

        <div
          className="absolute w-48 h-36 bg-gray-900 rounded-lg overflow-hidden shadow-lg cursor-move select-none"
          style={{ left: localPreviewPos.x, top: localPreviewPos.y, zIndex: 20 }}
          onPointerDown={handleLocalPointerDown}
          onPointerMove={handleLocalPointerMove}
          onPointerUp={handleLocalPointerUp}
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          {isVideoOff && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
              <VideoOff className="w-8 h-8 text-gray-600" />
            </div>
          )}
        </div>

        {isScreenSharing && (
          <div className="absolute bottom-4 left-4 w-48 h-36 bg-gray-900 rounded-lg overflow-hidden shadow-lg">
            <video
              ref={screenShareRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {cameraError && (
          <div className="absolute top-4 left-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-lg z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <VideoOff className="w-5 h-5" />
                <span className="text-sm">{cameraError}</span>
              </div>
              <button
                onClick={() => setCameraError("")}
                className="text-white hover:text-gray-200"
              >
                x
              </button>
            </div>
          </div>
        )}

        {screenShareError && (
          <div className="absolute top-20 left-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Monitor className="w-5 h-5" />
                <span className="text-sm">{screenShareError}</span>
              </div>
              <button
                onClick={() => setScreenShareError("")}
                className="text-white hover:text-gray-200"
              >
                x
              </button>
            </div>
          </div>
        )}

        {availableCameras.length > 1 && (
          <div className="absolute top-4 left-4 bg-gray-900 rounded-lg p-2 shadow-lg z-10">
            <select
              value={selectedCamera}
              onChange={(e) => switchCamera(e.target.value)}
              className="bg-gray-800 text-white text-sm rounded px-2 py-1 border border-gray-700 focus:outline-none focus:border-blue-500"
            >
              {availableCameras.map((camera) => (
                <option key={camera.deviceId} value={camera.deviceId}>
                  {camera.label || `Camera ${camera.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="bg-gray-900 p-4">
        <div className="flex items-center justify-center space-x-6">
          {!isCallActive ? (
            <button
              onClick={startCall}
              className="bg-green-600 hover:bg-green-700 text-white p-4 rounded-full transition-colors"
            >
              <Phone className="w-6 h-6" />
            </button>
          ) : (
            <>
              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={togglePictureInPicture}
                  className="p-4 rounded-full transition-colors bg-gray-700 hover:bg-gray-600 text-white"
                  title={isPipActive ? "Exit Picture-in-Picture" : "Picture-in-Picture"}
                >
                  <Square className="w-6 h-6" />
                </button>
                <span className="text-xs text-gray-300">PiP</span>
              </div>

              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={toggleMute}
                  className={`p-4 rounded-full transition-colors ${
                    isMuted ? "bg-red-600 hover:bg-red-700" : "bg-gray-700 hover:bg-gray-600"
                  } text-white`}
                >
                  {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>
                <span className="text-xs text-gray-300">Mute</span>
              </div>

              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={toggleVideo}
                  className={`p-4 rounded-full transition-colors ${
                    isVideoOff
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-gray-700 hover:bg-gray-600"
                  } text-white`}
                >
                  {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                </button>
                <span className="text-xs text-gray-300">Video</span>
              </div>

              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={isScreenSharing ? stopScreenShare : startScreenShare}
                  className={`p-4 rounded-full transition-colors ${
                    isScreenSharing
                      ? "bg-blue-600 hover:bg-blue-700"
                      : "bg-gray-700 hover:bg-gray-600"
                  } text-white`}
                  title="Share screen"
                >
                  <Monitor className="w-6 h-6" />
                </button>
                <span className="text-xs text-gray-300">Screen</span>
              </div>

              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={startYouTubeShare}
                  className="p-4 rounded-full transition-colors bg-gray-700 hover:bg-gray-600 text-white"
                  title="Share app tab"
                >
                  <div className="relative">
                    <Monitor className="w-6 h-6" />
                    <span className="absolute -bottom-2 -right-2 bg-red-600 text-white text-[10px] px-1 rounded">
                      APP
                    </span>
                  </div>
                </button>
                <span className="text-xs text-gray-300">App Tab</span>
              </div>

              <div className="flex flex-col items-center gap-1">
                <RecordingOptions
                  isRecording={isRecording}
                  onStartRecording={startRecording}
                  onStopRecording={stopRecording}
                  recordingMode={recordingMode}
                  onRecordingModeChange={setRecordingMode}
                />
                <span className="text-xs text-gray-300">Record</span>
              </div>

              {onHide && (
                <div className="flex flex-col items-center gap-1">
                  <button
                    onClick={onHide}
                    className="p-4 rounded-full transition-colors bg-gray-700 hover:bg-gray-600 text-white"
                    title="Hide call"
                  >
                    <Users className="w-6 h-6" />
                  </button>
                  <span className="text-xs text-gray-300">Hide</span>
                </div>
              )}

              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={() => endCall(false, "user-click")}
                  className="bg-red-600 hover:bg-red-700 text-white p-4 rounded-full transition-colors"
                >
                  <PhoneOff className="w-6 h-6" />
                </button>
                <span className="text-xs text-gray-300">End</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Picture-in-Picture provides the floating window */}

      <CombinedRecorder
        ref={recorderRef}
        localStream={localStreamRef.current}
        screenStream={screenStreamRef.current}
        remoteStream={remoteStreamRef.current}
        isRecording={isRecording}
        recordingMode={recordingMode}
        onRecordingStart={() => null}
        onRecordingStop={handleRecordingComplete}
      />
    </div>
  );
};

export default VideoCall;
