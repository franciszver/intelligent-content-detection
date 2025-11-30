/**
 * React hook for photo detection workflow
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  getUploadUrl,
  uploadPhotoToS3,
  uploadPhotoViaApi,
  analyzePhoto,
  pollWorkflowResults,
  getSingleAgentResults,
  pollSingleAgentResults,
} from '../services/api';
import type { PhotoMetadata, SingleAgentResultsResponse, UploadResponse } from '../types/detection';
import { extractErrorMessage } from '../utils/errorUtils';

type AgentStage = 'orchestrator' | 'agent1' | 'agent2' | 'agent3' | 'single';
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
  single: 'Single Agent',
};

const createInitialStatuses = (): AgentStatusMap => ({
  orchestrator: { label: STAGE_LABELS.orchestrator, status: 'idle' },
  agent1: { label: STAGE_LABELS.agent1, status: 'idle' },
  agent2: { label: STAGE_LABELS.agent2, status: 'idle' },
  agent3: { label: STAGE_LABELS.agent3, status: 'idle' },
  single: { label: STAGE_LABELS.single, status: 'idle' },
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
  singleAgentResults: SingleAgentResultsResponse | null;
  singleAgentLoading: boolean;
  singleAgentError: string | null;
  refreshSingleAgent: (photoId?: string) => Promise<void>;
}

export function usePhotoDetection(): UsePhotoDetectionReturn {
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [metadata, setMetadata] = useState<PhotoMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatusMap>(createInitialStatuses);
  const [singleAgentResults, setSingleAgentResults] = useState<SingleAgentResultsResponse | null>(null);
  const [singleAgentLoading, setSingleAgentLoading] = useState(false);
  const [singleAgentError, setSingleAgentError] = useState<string | null>(null);
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

  const normalizeStage = useCallback((stage?: string): AgentStage | undefined => {
    if (!stage) return undefined;
    if (stage === 'single-agent') return 'single';
    if (stage === 'workflow') return 'orchestrator';
    if ((['orchestrator', 'agent1', 'agent2', 'agent3', 'single'] as const).includes(stage as AgentStage)) {
      return stage as AgentStage;
    }
    return undefined;
  }, []);

  const handleWebsocketMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        const stage = normalizeStage(payload.stage);
        if (stage && STAGE_LABELS[stage]) {
          const status = (payload.status || 'running') as AgentStatusValue;
          const details = payload.error ? extractErrorMessage(payload.error) : undefined;
          updateAgentStatus(stage, status, details);

          if (status === 'failed' && payload.error) {
            const errorMessage = extractErrorMessage(payload.error);
            setError(errorMessage);
            setAnalyzing(false);
          }
        }
      } catch (err) {
        console.warn('Failed to parse websocket payload', err);
      }
    },
    [normalizeStage, updateAgentStatus]
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
        updateAgentStatus('single', 'pending');
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

  const fetchSingleAgentResults = useCallback(
    async (photoId?: string, poll = false) => {
      const targetId = photoId || currentPhotoRef.current;
      if (!targetId) {
        return;
      }
      setSingleAgentLoading(true);
      setSingleAgentError(null);
      try {
        const results = poll
          ? await pollSingleAgentResults(targetId)
          : await getSingleAgentResults(targetId);
        setSingleAgentResults(results);
        updateAgentStatus('single', 'completed');
      } catch (err) {
        const errorMessage = extractErrorMessage(err);
        setSingleAgentError(errorMessage);
        updateAgentStatus('single', 'failed', errorMessage);
        if (poll) {
          throw err;
        }
      } finally {
        setSingleAgentLoading(false);
      }
    },
    [updateAgentStatus]
  );

  const analyzePhotoHandler = useCallback(async (photoId: string, s3Key?: string) => {
    try {
      setError(null);
      setAnalyzing(true);
      setAgentStatuses(createInitialStatuses());
      setSingleAgentResults(null);
      setSingleAgentError(null);
      currentPhotoRef.current = photoId;

      if (websocketUrl) {
        connectWebsocket(photoId);
      } else {
        updateAgentStatus('orchestrator', 'running');
        updateAgentStatus('agent1', 'pending');
        updateAgentStatus('agent2', 'pending');
        updateAgentStatus('agent3', 'pending');
        updateAgentStatus('single', 'pending');
      }

      // Trigger multi-agent analysis
      await analyzePhoto(photoId, s3Key);

      // Poll for results
      const result = await pollWorkflowResults(photoId);
      setMetadata(result);
      try {
        updateAgentStatus('single', 'running');
        await fetchSingleAgentResults(photoId, true);
      } catch {
        // error handled inside fetchSingleAgentResults
      }
      if (!websocketUrl) {
        updateAgentStatus('agent1', 'completed');
        updateAgentStatus('agent2', 'completed');
        updateAgentStatus('agent3', 'completed');
        updateAgentStatus('orchestrator', 'completed');
      }
      disconnectWebsocket();
      setAnalyzing(false);
    } catch (err) {
      const errorMessage = extractErrorMessage(err);
      setError(errorMessage);
      setAnalyzing(false);
      disconnectWebsocket();
    }
  }, [connectWebsocket, disconnectWebsocket, fetchSingleAgentResults, updateAgentStatus, websocketUrl]);

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
        const errMsg = extractErrorMessage(err);
        console.warn('Direct S3 upload failed, falling back to API upload:', errMsg);
        try {
          const apiUploadResult = await uploadPhotoViaApi(userId, file);
          finalPhotoId = apiUploadResult.photo_id;
          finalS3Key = apiUploadResult.s3_key;
          console.log('API upload successful:', { photo_id: finalPhotoId });
        } catch (apiErr: any) {
          const apiErrMsg = extractErrorMessage(apiErr);
          console.error('API upload also failed:', apiErrMsg);
          throw new Error(`Upload failed: ${apiErrMsg}`);
        }
      }

      // Step 3: Run multi-agent analysis
      setUploading(false);
      await analyzePhotoHandler(finalPhotoId, finalS3Key);
    } catch (err) {
      const errorMessage = extractErrorMessage(err);
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
    setSingleAgentResults(null);
    setSingleAgentError(null);
    disconnectWebsocket();
  }, [disconnectWebsocket]);

  return {
    uploading,
    analyzing,
    metadata,
    error,
    uploadPhoto,
    analyzePhoto: analyzePhotoHandler,
    reset,
    agentStatuses,
    singleAgentResults,
    singleAgentLoading,
    singleAgentError,
    refreshSingleAgent: (photoId?: string) => fetchSingleAgentResults(photoId, false),
  };
}

