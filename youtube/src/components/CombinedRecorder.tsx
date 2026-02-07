import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";

type RecordingMode =
  | "camera-only"
  | "screen-only"
  | "combined"
  | "picture-in-picture";

export type CombinedRecorderHandle = {
  stop: () => void;
};

interface CombinedRecorderProps {
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isRecording: boolean;
  recordingMode: RecordingMode;
  onRecordingStart: () => void;
  onRecordingStop: (blob: Blob) => void;
}

const CombinedRecorder = forwardRef<CombinedRecorderHandle, CombinedRecorderProps>(
  (
    {
      localStream,
      screenStream,
      remoteStream,
      isRecording,
      recordingMode,
      onRecordingStart,
      onRecordingStop,
    },
    ref
  ) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Video elements for proper rendering
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  // Audio mixing
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const audioSourcesRef = useRef<MediaStreamAudioSourceNode[]>([]);

  const getReadyVideo = (ref: React.RefObject<HTMLVideoElement | null>) => {
    if (ref.current && ref.current.readyState >= 2) return ref.current;
    return null;
  };

  // Initialize video elements
  const initializeVideoElements = useCallback(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => null);
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(() => null);
    }

    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = screenStream;
      screenVideoRef.current.play().catch(() => null);
    }
  }, [localStream, remoteStream, screenStream]);

  // Initialize canvas
  const initializeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = 1280;
    canvas.height = 720;
    setIsInitialized(true);
  }, []);

  const drawSingle = (ctx: CanvasRenderingContext2D, video: HTMLVideoElement) => {
    ctx.drawImage(video, 0, 0, 1280, 720);
  };

  const drawSideBySide = (
    ctx: CanvasRenderingContext2D,
    left: HTMLVideoElement,
    right: HTMLVideoElement
  ) => {
    ctx.drawImage(left, 0, 0, 640, 720);
    ctx.drawImage(right, 640, 0, 640, 720);
  };

  // Draw to canvas
  const drawToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const screenVideo = getReadyVideo(screenVideoRef);
    const remoteVideo = getReadyVideo(remoteVideoRef);
    const localVideo = getReadyVideo(localVideoRef);

    // Clear canvas
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (recordingMode === "camera-only" && localVideo) {
      drawSingle(ctx, localVideo);
    } else if (recordingMode === "screen-only" && screenVideo) {
      drawSingle(ctx, screenVideo);
    } else if (recordingMode === "combined") {
      if (screenVideo && remoteVideo) {
        drawSideBySide(ctx, screenVideo, remoteVideo);
      } else if (screenVideo && localVideo) {
        drawSideBySide(ctx, screenVideo, localVideo);
      } else if (remoteVideo && localVideo) {
        drawSideBySide(ctx, remoteVideo, localVideo);
      } else if (screenVideo || remoteVideo || localVideo) {
        drawSingle(ctx, (screenVideo || remoteVideo || localVideo) as HTMLVideoElement);
      } else {
        ctx.fillStyle = "#333333";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    } else {
      const mainVideo = screenVideo || remoteVideo || localVideo;
      if (mainVideo) {
        drawSingle(ctx, mainVideo);
      } else {
        ctx.fillStyle = "#333333";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    // Picture-in-picture overlay
    if (recordingMode === "picture-in-picture" && localVideo) {
      const pipWidth = 240;
      const pipHeight = 180;
      const pipX = canvas.width - pipWidth - 20;
      const pipY = canvas.height - pipHeight - 20;

      ctx.fillStyle = "#000000";
      ctx.fillRect(pipX - 2, pipY - 2, pipWidth + 4, pipHeight + 4);
      ctx.drawImage(localVideo, pipX, pipY, pipWidth, pipHeight);
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(pipX, pipY + pipHeight - 25, pipWidth, 25);
      ctx.fillStyle = "#ffffff";
      ctx.font = "14px Arial";
      ctx.fillText("You", pipX + 10, pipY + pipHeight - 8);
    }

    // Timestamp
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(canvas.width - 120, 10, 110, 25);
    ctx.fillStyle = "#ffffff";
    ctx.font = "14px Arial";
    ctx.fillText(timestamp, canvas.width - 110, 27);

    if (isRecordingRef.current) {
      animationFrameRef.current = requestAnimationFrame(drawToCanvas);
    }
  }, [recordingMode]);

  const cleanupAudio = () => {
    audioSourcesRef.current.forEach((source) => {
      try {
        source.disconnect();
      } catch {
        // ignore
      }
    });
    audioSourcesRef.current = [];
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => null);
      audioContextRef.current = null;
      audioDestinationRef.current = null;
    }
  };

  const connectAudioStream = (
    audioContext: AudioContext,
    destination: MediaStreamAudioDestinationNode,
    stream: MediaStream | null
  ) => {
    if (!stream || stream.getAudioTracks().length === 0) return;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(destination);
    audioSourcesRef.current.push(source);
  };

  // Stop recording
  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.requestData();
      } catch {
        // ignore
      }
      mediaRecorderRef.current.stop();
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  useImperativeHandle(ref, () => ({
    stop: () => {
      stopRecording();
      cleanupAudio();
    },
  }));

  // Start recording
  const startRecording = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      if (mediaRecorderRef.current?.state === "recording") {
        return;
      }
      cleanupAudio();

      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      audioContextRef.current = audioContext;
      audioDestinationRef.current = destination;

      connectAudioStream(audioContext, destination, localStream);
      connectAudioStream(audioContext, destination, remoteStream);
      connectAudioStream(audioContext, destination, screenStream);

      const canvasStream = canvas.captureStream(30);
      const audioTracks = destination.stream.getAudioTracks();
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioTracks,
      ]);

      if (combinedStream.getTracks().length === 0) {
        throw new Error("No media tracks available for recording");
      }

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
        ? "video/webm;codecs=vp8"
        : "video/webm";
      const mediaRecorder = new MediaRecorder(combinedStream, { mimeType });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error("Recording error:", event);
        cleanupAudio();
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        if (blob.size > 0) {
          onRecordingStop(blob);
        } else {
          console.warn("Recording stopped but produced empty blob");
        }
        chunksRef.current = [];
        cleanupAudio();
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      isRecordingRef.current = true;

      drawToCanvas();

      onRecordingStart();
    } catch (error) {
      console.error("Error starting recording:", error);
      isRecordingRef.current = false;
      cleanupAudio();
    }
  }, [drawToCanvas, localStream, remoteStream, screenStream, onRecordingStart, onRecordingStop]);

  // Initialize on mount
  useEffect(() => {
    initializeCanvas();
    initializeVideoElements();
  }, [initializeCanvas, initializeVideoElements]);

  // Update video elements when streams change
  useEffect(() => {
    initializeVideoElements();
  }, [localStream, remoteStream, screenStream, initializeVideoElements]);

  // Handle recording state
  useEffect(() => {
    if (isRecording && isInitialized) {
      startRecording();
    } else if (!isRecording) {
      stopRecording();
    }
  }, [isRecording, isInitialized, startRecording, stopRecording]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopRecording();
      cleanupAudio();
    };
  }, [stopRecording]);

  return (
    <>
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        style={{ display: "none" }}
      />
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        style={{ display: "none" }}
      />
      <video
        ref={screenVideoRef}
        autoPlay
        playsInline
        style={{ display: "none" }}
      />
      <canvas
        ref={canvasRef}
        style={{ display: "none" }}
        width={1280}
        height={720}
      />
    </>
  );
  }
);

export default CombinedRecorder;
