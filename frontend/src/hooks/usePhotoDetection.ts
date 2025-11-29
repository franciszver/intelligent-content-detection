/**
 * React hook for photo detection workflow
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { getUploadUrl, uploadPhotoToS3, uploadPhotoViaApi, analyzePhoto, pollWorkflowResults } from '../services/api';
import type { PhotoMetadata, UploadResponse } from '../types/detection';

type AgentStage = 'orchestrator' | 'agent1' | 'agent2' | 'agent3';
type AgentStatusValue = 'idle' | 'pending' | 'running' | 'completed' | 'failed';

interface AgentStatusState {
  label: string;
  status: AgentStatusValue;
  details?: string;
}

type AgentStatusMap = Record<AgentStage, AgentStatusState>;

const STAGE_LABELS: Record<AgentStage, string> = {
  orchestrator: 'Orchestrator',
  agent1: 'Wireframe Agent',
  agent2: 'Color Agent',
  agent3: 'Overlay Agent',
};

const createInitialStatuses = (): AgentStatusMap => ({
  orchestrator: { label: STAGE_LABELS.orchestrator, status: 'idle' },
  agent1: { label: STAGE_LABELS.agent1, status: 'idle' },
  agent2: { label: STAGE_LABELS.agent2, status: 'idle' },
  agent3: { label: STAGE_LABELS.agent3, status: 'idle' },
});

interface UsePhotoDetectionReturn {
  uploading: boolean;
  analyzing: boolean;
  metadata: PhotoMetadata | null;
  error: string | null;
  uploadPhoto: (file: File, userId?: string) => Promise<void>;
  analyzePhoto: (photoId: string, s3Key?: string) => Promise<void>;
  reset: () => void;
  agentStatuses: AgentStatusMap;
}

export function usePhotoDetection(): UsePhotoDetectionReturn {
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [metadata, setMetadata] = useState<PhotoMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatusMap>(createInitialStatuses);
  const wsRef = useRef<WebSocket | null>(null);
  const currentPhotoRef = useRef<string | null>(null);
  const websocketUrl = import.meta.env.VITE_WS_BASE_URL as string | undefined;

  const updateAgentStatus = useCallback((stage: AgentStage, status: AgentStatusValue, details?: string) => {
    setAgentStatuses((prev) => ({
      ...prev,
      [stage]: { ...prev[stage], status, details },
    }));
  }, []);

  const disconnectWebsocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    currentPhotoRef.current = null;
  }, []);

  const handleWebsocketMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        const stage = payload.stage as AgentStage | undefined;
        if (stage && STAGE_LABELS[stage]) {
          const status = (payload.status || 'running') as AgentStatusValue;
          const details = payload.error || undefined;
          updateAgentStatus(stage, status, details);

          if (status === 'failed' && payload.error) {
            setError(payload.error);
            setAnalyzing(false);
          }
        }
      } catch (err) {
        console.warn('Failed to parse websocket payload', err);
      }
    },
    [updateAgentStatus]
  );

  const connectWebsocket = useCallback(
    (photoId: string) => {
      if (!websocketUrl) return;
      disconnectWebsocket();
      const socket = new WebSocket(websocketUrl);
      currentPhotoRef.current = photoId;
      wsRef.current = socket;

      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            action: 'subscribe',
            photo_id: photoId,
          })
        );
        updateAgentStatus('orchestrator', 'running');
        updateAgentStatus('agent1', 'pending');
        updateAgentStatus('agent2', 'pending');
        updateAgentStatus('agent3', 'pending');
      };

      socket.onmessage = handleWebsocketMessage;

      socket.onerror = (evt) => {
        console.warn('WebSocket error', evt);
      };

      socket.onclose = () => {
        wsRef.current = null;
      };
    },
    [websocketUrl, disconnectWebsocket, handleWebsocketMessage, updateAgentStatus]
  );

  useEffect(() => {
    return () => {
      disconnectWebsocket();
    };
  }, [disconnectWebsocket]);

  const analyzePhotoHandler = useCallback(async (photoId: string, s3Key?: string) => {
    try {
      setError(null);
      setAnalyzing(true);
      setAgentStatuses(createInitialStatuses());

      if (websocketUrl) {
        connectWebsocket(photoId);
      } else {
        updateAgentStatus('orchestrator', 'running');
        updateAgentStatus('agent1', 'pending');
        updateAgentStatus('agent2', 'pending');
        updateAgentStatus('agent3', 'pending');
      }

      // Trigger multi-agent analysis
      await analyzePhoto(photoId, s3Key);

      // Poll for results
      const result = await pollWorkflowResults(photoId);
      setMetadata(result);
      if (!websocketUrl) {
        updateAgentStatus('agent1', 'completed');
        updateAgentStatus('agent2', 'completed');
        updateAgentStatus('agent3', 'completed');
        updateAgentStatus('orchestrator', 'completed');
      }
      disconnectWebsocket();
      setAnalyzing(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setAnalyzing(false);
      disconnectWebsocket();
    }
  }, [connectWebsocket, disconnectWebsocket, updateAgentStatus, websocketUrl]);

  const uploadPhoto = useCallback(async (file: File, userId?: string) => {
    try {
      setError(null);
      setUploading(true);

      // Step 1: Get presigned URL
      const uploadData: UploadResponse = await getUploadUrl(userId);

      // Step 2: Upload to S3 (with fallback to API upload on any error)
      let finalPhotoId = uploadData.photo_id;
      let finalS3Key = uploadData.s3_key;

      try {
        await uploadPhotoToS3(uploadData.upload_url, file);
        console.log('Direct S3 upload successful');
      } catch (err: any) {
        // If any error (especially CORS), fall back to API upload
        console.warn('Direct S3 upload failed, falling back to API upload:', err?.message || err);
        try {
          const apiUploadResult = await uploadPhotoViaApi(userId, file);
          finalPhotoId = apiUploadResult.photo_id;
          finalS3Key = apiUploadResult.s3_key;
          console.log('API upload successful:', { photo_id: finalPhotoId });
        } catch (apiErr: any) {
          console.error('API upload also failed:', apiErr);
          throw new Error(`Upload failed: ${apiErr?.message || 'Unknown error'}`);
        }
      }

      // Step 3: Run multi-agent analysis
      setUploading(false);
      await analyzePhotoHandler(finalPhotoId, finalS3Key);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setUploading(false);
    }
  }, [analyzePhotoHandler]);

  const reset = useCallback(() => {
    setMetadata(null);
    setError(null);
    setUploading(false);
    setAnalyzing(false);
    setAgentStatuses(createInitialStatuses());
    disconnectWebsocket();
  }, []);

  return {
    uploading,
    analyzing,
    metadata,
    error,
    uploadPhoto,
    analyzePhoto: analyzePhotoHandler,
    reset,
    agentStatuses,
  };
}

