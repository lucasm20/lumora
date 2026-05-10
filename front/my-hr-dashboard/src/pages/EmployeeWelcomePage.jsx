import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getCameraCaptureRequest,
  publishCameraSnapshot,
} from '../services/api';
import '../App.css';

const EmployeeWelcomePage = () => {
  const { firebaseUser, userProfile, logout } = useAuth();
  const [cameraOn, setCameraOn] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const [status, setStatus] = useState('idle');
  const [cameraError, setCameraError] = useState('');
  const [snapshotStatus, setSnapshotStatus] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const captureRequestIntervalRef = useRef(null);
  const lastHandledRequestIdRef = useRef('');
  const cameraStartedAtRef = useRef(0);
  const navigate = useNavigate();

  useEffect(() => () => {
    if (captureRequestIntervalRef.current) {
      clearInterval(captureRequestIntervalRef.current);
      captureRequestIntervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

  }, [firebaseUser]);

  useEffect(() => {
    if (!cameraOn || !streamRef.current || !videoRef.current) {
      return undefined;
    }

    let cancelled = false;
    const video = videoRef.current;
    video.srcObject = streamRef.current;

    const playPromise = video.play();
    if (playPromise) {
      playPromise.catch(() => {
        setCameraError('No se pudo iniciar la vista previa de la camara.');
      });
    }

    return () => {
      cancelled = true;
    };
  }, [cameraOn]);

  useEffect(() => {
    if (!cameraOn || !firebaseUser || !streamRef.current) {
      return undefined;
    }

    let cancelled = false;

    const checkCaptureRequest = async () => {
      try {
        const token = await firebaseUser.getIdToken();
        const response = await getCameraCaptureRequest(token);
        const request = response.request;
        const requestedAt = request?.requestedAt ? new Date(request.requestedAt).getTime() : 0;

        if (
          !request?.requestId ||
          request.requestId === lastHandledRequestIdRef.current ||
          requestedAt <= cameraStartedAtRef.current
        ) {
          return;
        }

        lastHandledRequestIdRef.current = request.requestId;
        setSnapshotStatus('HR solicito una captura. Enviando imagen...');
        captureFrameWithRetry(request.requestId);
      } catch (error) {
        if (!cancelled) {
          setCameraError(error.message || 'No se pudo consultar solicitudes de HR.');
        }
      }
    };

    checkCaptureRequest();
    captureRequestIntervalRef.current = setInterval(checkCaptureRequest, 2000);

    return () => {
      cancelled = true;

      if (captureRequestIntervalRef.current) {
        clearInterval(captureRequestIntervalRef.current);
        captureRequestIntervalRef.current = null;
      }
    };
  }, [cameraOn, firebaseUser]);

  const getSmileHintFromCanvas = (canvas, context) => {
    const region = {
      left: Math.floor(canvas.width * 0.34),
      top: Math.floor(canvas.height * 0.46),
      width: Math.floor(canvas.width * 0.32),
      height: Math.floor(canvas.height * 0.16),
    };
    const pixels = context.getImageData(region.left, region.top, region.width, region.height).data;
    let longestRun = 0;
    let brightPixels = 0;

    for (let y = 0; y < region.height; y += 1) {
      let run = 0;

      for (let x = 0; x < region.width; x += 1) {
        const index = (y * region.width + x) * 4;
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const max = Math.max(red, green, blue);
        const min = Math.min(red, green, blue);
        const isBrightLowSaturation =
          red > 180 && green > 170 && blue > 145 && max - min < 55;

        if (isBrightLowSaturation) {
          run += 1;
          brightPixels += 1;
          longestRun = Math.max(longestRun, run);
        } else {
          run = 0;
        }
      }
    }

    const runScore = longestRun / Math.max(1, canvas.width * 0.11);
    const densityScore = brightPixels / Math.max(1, region.width * region.height * 0.08);
    const score = Math.min(1, (runScore + densityScore) / 2);

    return {
      smileLikely: longestRun >= canvas.width * 0.08 && brightPixels >= region.width * 0.55,
      smileScore: Number(score.toFixed(2)),
      longestBrightRun: longestRun,
      brightPixels,
    };
  };

  const captureFrame = async (requestId) => {
    if (!firebaseUser || !videoRef.current || !streamRef.current) {
      return;
    }

    const video = videoRef.current;

    if (!video.videoWidth || !video.videoHeight) {
      throw new Error('La camara aun no tiene un frame listo para enviar.');
    }

    const maxWidth = 2560;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const captureHints = getSmileHintFromCanvas(canvas, context);
    const imageBase64 = canvas.toDataURL('image/jpeg', 0.92);
    const token = await firebaseUser.getIdToken();
    const response = await publishCameraSnapshot(token, imageBase64, requestId, captureHints);
    setSnapshotStatus(
      `Captura enviada a HR: ${new Date(response.capturedAt).toLocaleTimeString()}`
    );
  };

  const captureFrameWithRetry = (requestId, attempt = 0) => {
    captureFrame(requestId).catch((error) => {
      if (attempt < 5 && error.message?.includes('frame listo')) {
        setTimeout(() => captureFrameWithRetry(requestId, attempt + 1), 500);
        return;
      }

      setSnapshotStatus('');
      setCameraError(error.message || 'No se pudo enviar la captura solicitada por HR.');
    });
  };

  const stopCamera = async () => {
    if (captureRequestIntervalRef.current) {
      clearInterval(captureRequestIntervalRef.current);
      captureRequestIntervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOn(false);
    setStatus('idle');
    setSnapshotStatus('');
    lastHandledRequestIdRef.current = '';
    cameraStartedAtRef.current = 0;

  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const startCamera = async () => {
    if (startingCamera || streamRef.current) {
      return;
    }

    setCameraError('');
    setSnapshotStatus('');
    setStatus('loading');
    setStartingCamera(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 2560 },
          height: { ideal: 1440 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: 'user',
        },
      });
      streamRef.current = stream;
      cameraStartedAtRef.current = Date.now();
      setCameraOn(true);
      setStatus('waiting');
    } catch (error) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      setCameraOn(false);
      setCameraError(
        error.message || 'No se pudo acceder a la camara. Revisa permisos y vuelve a intentar.'
      );
      setStatus('idle');
    } finally {
      setStartingCamera(false);
    }
  };

  return (
    <div className="employee-shell">
      <header className="employee-top">
        <div>
          <span className="employee-eyebrow">Employee Access</span>
          <h1>Bienvenido, {userProfile?.username || 'empleado'}</h1>
          <p className="employee-company">{userProfile?.companyName || 'Empresa'} </p>
        </div>
        <button className="ghost-button" type="button" onClick={handleLogout}>
          Log out
        </button>
      </header>

      <main className="employee-main">
        <section className="employee-card">
          <div className="employee-message">
            <h2>Enciende tu camara</h2>
            <p>
              Enciende tu camara y espera a que HR procese la imagen desde su dashboard.
            </p>
          </div>
          <button
            className="camera-button"
            type="button"
            onClick={cameraOn ? stopCamera : startCamera}
            disabled={startingCamera}
          >
            {startingCamera ? 'Encendiendo...' : cameraOn ? 'Apagar camara' : 'Encender camara'}
          </button>
          {cameraError && <div className="form-alert error">{cameraError}</div>}
          {snapshotStatus && <div className="form-alert success">{snapshotStatus}</div>}
        </section>

        <section className="employee-card employee-preview">
          <div className="preview-box">
            {cameraOn ? (
              <video ref={videoRef} autoPlay muted playsInline />
            ) : (
              <div className="preview-placeholder">Vista previa</div>
            )}
          </div>
          <div className="preview-status">
            {status === 'loading' && <span>Cargando...</span>}
            {status === 'waiting' && <span>Esperando procesamiento de HR...</span>}
          </div>
        </section>
      </main>
    </div>
  );
};

export default EmployeeWelcomePage;
