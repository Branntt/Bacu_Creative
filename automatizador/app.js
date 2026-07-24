(() => {
  "use strict";

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");

  const workSection = document.getElementById("workSection");
  const workTitle = document.getElementById("workTitle");
  const previewFrame = document.getElementById("previewFrame");

  const idleControls = document.getElementById("idleControls");
  const idleHint = document.getElementById("idleHint");
  const durationInput = document.getElementById("durationInput");
  const recordBtn = document.getElementById("recordBtn");

  const recordingControls = document.getElementById("recordingControls");
  const recordingStatus = document.getElementById("recordingStatus");
  const stopBtn = document.getElementById("stopBtn");

  const resultSection = document.getElementById("resultSection");
  const resultVideo = document.getElementById("resultVideo");
  const downloadBtn = document.getElementById("downloadBtn");
  const convertBtn = document.getElementById("convertBtn");
  const convertStatus = document.getElementById("convertStatus");
  const resetBtn = document.getElementById("resetBtn");

  const errorBanner = document.getElementById("errorBanner");
  const compatNote = document.getElementById("compatNote");

  const DEFAULT_DURATION = 10;
  const MAX_DURATION = 120;

  let currentFile = null;
  let currentHtmlText = "";
  let previewObjectUrl = null;
  let mediaStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordedBlob = null;
  let stopTimer = null;
  let countdownInterval = null;

  const supportsDisplayCapture = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  const supportsRecorder = !!window.MediaRecorder;

  if (!supportsDisplayCapture || !supportsRecorder) {
    compatNote.textContent = "Tu navegador no soporta grabación de pantalla (getDisplayMedia/MediaRecorder). Probá con Chrome o Edge actualizados.";
    compatNote.hidden = false;
  }

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.hidden = false;
  }

  function clearError() {
    errorBanner.hidden = true;
    errorBanner.textContent = "";
  }

  function humanSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  function extractDuration(html) {
    const match =
      html.match(/<meta[^>]+name=["']duracion["'][^>]+content=["']([\d.]+)["'][^>]*>/i) ||
      html.match(/<meta[^>]+name=["']duration["'][^>]+content=["']([\d.]+)["'][^>]*>/i);
    if (match) {
      const n = parseFloat(match[1]);
      if (!isNaN(n) && n > 0) return Math.min(n, MAX_DURATION);
    }
    return null;
  }

  function outputName(ext) {
    const base = currentFile ? currentFile.name.replace(/\.html?$/i, "") : "video";
    return `${base}.${ext}`;
  }

  function triggerDownload(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* ---------- file intake ---------- */

  async function handleFile(file) {
    clearError();
    if (!file) return;

    const looksHtml = /\.html?$/i.test(file.name) || file.type === "text/html";
    if (!looksHtml) {
      showError("Ese archivo no parece ser un .html. Elegí un archivo HTML.");
      return;
    }

    currentFile = file;
    currentHtmlText = await file.text();

    fileInfo.hidden = false;
    fileInfo.querySelector(".file-name").textContent = file.name;
    fileInfo.querySelector(".file-meta").textContent = humanSize(file.size);

    const detected = extractDuration(currentHtmlText);
    durationInput.value = detected || DEFAULT_DURATION;

    loadPreview();

    workTitle.textContent = "Vista previa";
    workSection.hidden = false;
    idleControls.hidden = false;
    recordingControls.hidden = true;
    resultSection.hidden = true;
    recordBtn.disabled = !(supportsDisplayCapture && supportsRecorder);

    workSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function loadPreview() {
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    const blob = new Blob([currentHtmlText], { type: "text/html" });
    previewObjectUrl = URL.createObjectURL(blob);
    previewFrame.src = previewObjectUrl;
  }

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("is-dragover");
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("is-dragover");
    });
  });
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    handleFile(file);
  });

  /* ---------- recording ---------- */

  function pickMimeType() {
    const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) return c;
    }
    return "";
  }

  async function requestDisplayStream() {
    const enhanced = {
      video: { frameRate: 30, displaySurface: "browser" },
      audio: true,
      preferCurrentTab: true,
      selfBrowserSurface: "include",
    };
    try {
      return await navigator.mediaDevices.getDisplayMedia(enhanced);
    } catch (err) {
      if (err && err.name === "NotAllowedError") throw err;
      return await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
    }
  }

  async function startRecording() {
    clearError();
    if (!currentFile) return;

    let seconds = parseFloat(durationInput.value);
    if (isNaN(seconds) || seconds <= 0) seconds = DEFAULT_DURATION;
    seconds = Math.min(seconds, MAX_DURATION);

    recordBtn.disabled = true;

    try {
      mediaStream = await requestDisplayStream();
    } catch (err) {
      showError("No se pudo iniciar la grabación (¿cancelaste el permiso de compartir pantalla?).");
      recordBtn.disabled = false;
      return;
    }

    loadPreview();
    await new Promise((resolve) => setTimeout(resolve, 200));

    recordedChunks = [];
    const mimeType = pickMimeType();
    try {
      mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);
    } catch (err) {
      showError("Tu navegador no pudo iniciar el grabador de video.");
      cleanupStream();
      recordBtn.disabled = false;
      return;
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = onRecordingStopped;

    const videoTrack = mediaStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.addEventListener("ended", () => stopRecording());
    }

    mediaRecorder.start();

    idleControls.hidden = true;
    recordingControls.hidden = false;
    workTitle.textContent = "Grabando";

    let remaining = seconds;
    recordingStatus.textContent = `Grabando… ${remaining.toFixed(0)}s`;
    countdownInterval = setInterval(() => {
      remaining -= 1;
      recordingStatus.textContent = `Grabando… ${Math.max(remaining, 0).toFixed(0)}s`;
    }, 1000);

    stopTimer = setTimeout(stopRecording, seconds * 1000);
    window.addEventListener("message", onChildMessage);
  }

  function onChildMessage(e) {
    if (e.data && e.data.type === "automatizador:done") {
      stopRecording();
    }
  }

  function stopRecording() {
    if (stopTimer) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    window.removeEventListener("message", onChildMessage);
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    } else {
      cleanupStream();
    }
  }

  function cleanupStream() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
  }

  function onRecordingStopped() {
    cleanupStream();
    recordedBlob = new Blob(recordedChunks, { type: "video/webm" });
    resultVideo.src = URL.createObjectURL(recordedBlob);

    workSection.hidden = true;
    resultSection.hidden = false;
    recordBtn.disabled = false;
    convertStatus.hidden = true;

    triggerDownload(recordedBlob, outputName("webm"));
  }

  recordBtn.addEventListener("click", startRecording);
  stopBtn.addEventListener("click", stopRecording);

  downloadBtn.addEventListener("click", () => {
    if (recordedBlob) triggerDownload(recordedBlob, outputName("webm"));
  });

  resetBtn.addEventListener("click", () => {
    currentFile = null;
    currentHtmlText = "";
    recordedBlob = null;
    recordedChunks = [];
    fileInput.value = "";
    fileInfo.hidden = true;
    workSection.hidden = true;
    resultSection.hidden = true;
    clearError();
    dropzone.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* ---------- optional MP4 conversion (lazy-loaded ffmpeg.wasm) ---------- */

  let ffmpegInstance = null;

  async function ensureFfmpeg() {
    if (ffmpegInstance) return ffmpegInstance;

    convertStatus.hidden = false;
    convertStatus.textContent = "Cargando conversor (puede tardar unos segundos)…";

    const { FFmpeg } = await import("https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js");
    const { toBlobURL } = await import("https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/esm/index.js");
    const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

    const ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress }) => {
      const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
      convertStatus.textContent = `Convirtiendo a MP4… ${pct}%`;
    });

    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  }

  convertBtn.addEventListener("click", async () => {
    if (!recordedBlob) return;
    convertBtn.disabled = true;
    try {
      const ffmpeg = await ensureFfmpeg();
      const inputData = new Uint8Array(await recordedBlob.arrayBuffer());
      await ffmpeg.writeFile("input.webm", inputData);

      convertStatus.textContent = "Convirtiendo a MP4…";
      await ffmpeg.exec(["-i", "input.webm", "-c:v", "libx264", "-preset", "fast", "-c:a", "aac", "output.mp4"]);

      const data = await ffmpeg.readFile("output.mp4");
      const mp4Blob = new Blob([data.buffer], { type: "video/mp4" });
      triggerDownload(mp4Blob, outputName("mp4"));
      convertStatus.textContent = "MP4 descargado ✓";
    } catch (err) {
      convertStatus.hidden = false;
      convertStatus.textContent = "No se pudo convertir a MP4 en este navegador. Usá el .webm o convertilo con otra herramienta.";
    } finally {
      convertBtn.disabled = false;
    }
  });
})();
