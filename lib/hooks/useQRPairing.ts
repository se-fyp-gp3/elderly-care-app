import {
  deleteRegistrationRequest,
  getRegistrationRequest,
  RegistrationRequest,
} from "@/lib/registration";
import * as Crypto from "expo-crypto";
import { useEffect, useRef, useState } from "react";

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const length = 32;
  const randomBytes = Crypto.getRandomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    const index = randomBytes[i] % chars.length;
    result += chars.charAt(index);
  }
  return result;
}

const EXPIRY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export type QRPairingStatus =
  | "loading"
  | "waiting"
  | "scanned"
  | "signing-in"
  | "done"
  | "expired"
  | "cancelled"
  | "error";

export interface UseQRPairingOptions {
  /** Called to create the request row. Returns the created document. */
  createRequest: (token: string) => Promise<RegistrationRequest>;
  /**
   * Called when a completed request is detected during polling.
   * Use this to perform sign-in, navigation, etc.
   * Should call `setStatus("done")` (or `"signing-in"` then `"done"`) when finished.
   */
  onCompleted: (
    request: RegistrationRequest,
    helpers: {
      setStatus: (s: QRPairingStatus) => void;
      cleanup: (id: string) => void;
    },
  ) => Promise<void>;
  /** The QR payload `type` field, e.g. "elderly-register" or "elderly-connect". */
  qrType: string;
}

export function useQRPairing({
  createRequest,
  onCompleted,
  qrType,
}: UseQRPairingOptions) {
  const [token, setToken] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [status, setStatus] = useState<QRPairingStatus>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const stopExpiry = () => {
    if (expiryRef.current) {
      clearTimeout(expiryRef.current);
      expiryRef.current = null;
    }
  };

  const cleanup = (id: string) => {
    deleteRegistrationRequest(id).catch(() => {});
  };

  // Create the request on mount
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const t = generateToken();
        const request = await createRequest(t);
        const createdId = request.$id;
        if (cancelled) {
          cleanup(createdId);
          return;
        }
        setToken(t);
        setRequestId(createdId);
        setStatus("waiting");

        expiryRef.current = setTimeout(() => {
          stopPolling();
          setStatus("expired");
          cleanup(createdId);
          setRequestId(null);
        }, EXPIRY_TIMEOUT);
      } catch (err: any) {
        console.error("Failed to create pairing request:", err);
        if (cancelled) return;
        setErrorMsg("Failed to initialize. Please try again.");
        setStatus("error");
      }
    }

    init();

    return () => {
      cancelled = true;
      stopExpiry();
      stopPolling();
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (requestId) {
        cleanup(requestId);
      }
    };
  }, [requestId]);

  // Poll for status changes
  useEffect(() => {
    if ((status !== "waiting" && status !== "scanned") || !token) return;

    pollingRef.current = setInterval(async () => {
      try {
        const request = await getRegistrationRequest(token);
        if (!request) {
          stopPolling();
          stopExpiry();
          setStatus("expired");
          return;
        }

        if (request.status === "scanned" && status !== "scanned") {
          setStatus("scanned");
          stopExpiry();
        }

        if (request.status === "cancelled") {
          stopPolling();
          stopExpiry();
          setStatus("cancelled");
          cleanup(request.$id);
          setRequestId(null);
          return;
        }

        if (request.status === "completed") {
          stopPolling();
          stopExpiry();
          await onCompleted(request, { setStatus, cleanup });
        }
      } catch (err) {
        console.error("Polling error:", err);
        stopPolling();
        stopExpiry();
        setErrorMsg("An error occurred. Please try again.");
        setStatus("error");
        if (requestId) {
          cleanup(requestId);
          setRequestId(null);
        }
      }
    }, 1000);

    return () => {
      stopPolling();
    };
  }, [status, token, requestId, onCompleted, stopPolling, stopExpiry, cleanup]);

  const refresh = async () => {
    stopPolling();
    stopExpiry();

    if (requestId) {
      cleanup(requestId);
      setRequestId(null);
    }

    setStatus("loading");
    setErrorMsg(null);
    setToken(null);

    try {
      const t = generateToken();
      const request = await createRequest(t);
      setToken(t);
      setRequestId(request.$id);
      setStatus("waiting");

      expiryRef.current = setTimeout(() => {
        stopPolling();
        setStatus("expired");
        cleanup(request.$id);
        setRequestId(null);
      }, EXPIRY_TIMEOUT);
    } catch (err) {
      console.error("Failed to create pairing request:", err);
      setErrorMsg("Failed to initialize. Please try again.");
      setStatus("error");
    }
  };

  const cleanupAndLeave = () => {
    stopPolling();
    stopExpiry();
    if (requestId) {
      cleanup(requestId);
      setRequestId(null);
    }
  };

  const qrPayload = token ? JSON.stringify({ type: qrType, token }) : "";

  return {
    token,
    status,
    errorMsg,
    qrPayload,
    refresh,
    cleanupAndLeave,
  };
}
