const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

const AZURE_SPEECH_KEY = (process.env.AZURE_SPEECH_KEY || "").trim();
const AZURE_SPEECH_REGION = (process.env.AZURE_SPEECH_REGION || "southeastasia").trim();
const AZURE_CNV_PROJECT_ID = (process.env.AZURE_CNV_PROJECT_ID || "elderly-care-voice").trim();
const AZURE_CNV_LOCALE = (process.env.AZURE_CNV_LOCALE || "zh-HK").trim();
const AZURE_CNV_API_VERSION = (process.env.AZURE_CNV_API_VERSION || "2024-02-01-preview").trim();

const CNV_API_BASE = `https://${AZURE_SPEECH_REGION}.api.cognitive.microsoft.com/customvoice`;

function cnvUrl(apiPath) {
  return `${CNV_API_BASE}${apiPath}?api-version=${encodeURIComponent(AZURE_CNV_API_VERSION)}`;
}

function authHeader() {
  return {
    "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
  };
}

async function parseJsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }
  return req.body;
}

function randomId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

async function ensureProject() {
  const checkRes = await fetch(cnvUrl(`/projects/${AZURE_CNV_PROJECT_ID}`), {
    headers: authHeader(),
  });

  if (checkRes.ok) return AZURE_CNV_PROJECT_ID;

  const createRes = await fetch(cnvUrl(`/projects/${AZURE_CNV_PROJECT_ID}`), {
    method: "PUT",
    headers: {
      ...authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      kind: "PersonalVoice",
      description: "Elderly Care App – Caregiver Personal Voice Profiles",
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => "");
    throw new Error(
      `Failed to ensure Azure Personal Voice project (${createRes.status}). ${errText}`,
    );
  }

  return AZURE_CNV_PROJECT_ID;
}

async function writeBase64File(base64, filePath) {
  await fs.writeFile(filePath, Buffer.from(base64, "base64"));
}

async function convertToWav(inputPath, outputPath) {
  await new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i",
      inputPath,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      outputPath,
    ];

    const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });

    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg failed (${code}): ${stderr}`));
      }
    });
  });
}

async function createConsent(projectId, speakerName, consentWavPath) {
  const consentId = randomId("consent");
  const consentForm = new FormData();
  consentForm.append("projectId", projectId);
  consentForm.append("voiceTalentName", speakerName);
  consentForm.append("companyName", "Elderly Care App");
  consentForm.append("locale", AZURE_CNV_LOCALE);

  const consentBuffer = await fs.readFile(consentWavPath);
  const consentBlob = new Blob([consentBuffer], { type: "audio/wav" });
  consentForm.append("audiodata", consentBlob, "consent.wav");

  const consentRes = await fetch(cnvUrl(`/consents/${consentId}`), {
    method: "POST",
    headers: authHeader(),
    body: consentForm,
  });

  if (!consentRes.ok) {
    const err = await consentRes.text().catch(() => "");
    throw new Error(`Consent creation failed (${consentRes.status}). ${err}`);
  }

  const consentData = await consentRes.json();
  return consentData?.id || consentId;
}

async function createPersonalVoice(projectId, consentId, speakerName, sampleWavPaths) {
  const personalVoiceId = randomId("pv");

  const voiceForm = new FormData();
  voiceForm.append("projectId", projectId);
  voiceForm.append("consentId", consentId);
  voiceForm.append("description", `Personal voice – ${speakerName}`);

  for (let index = 0; index < sampleWavPaths.length; index += 1) {
    const wavBuffer = await fs.readFile(sampleWavPaths[index]);
    const wavBlob = new Blob([wavBuffer], { type: "audio/wav" });
    voiceForm.append("audiodata", wavBlob, `sample_${index + 1}.wav`);
  }

  const pvRes = await fetch(cnvUrl(`/personalvoices/${personalVoiceId}`), {
    method: "POST",
    headers: authHeader(),
    body: voiceForm,
  });

  if (!pvRes.ok) {
    const err = await pvRes.text().catch(() => "");
    throw new Error(`Personal voice creation failed (${pvRes.status}). ${err}`);
  }

  const pvData = await pvRes.json();
  const speakerProfileId = pvData?.speakerProfileId || pvData?.id || pvData?.personalVoiceId;

  if (!speakerProfileId) {
    throw new Error("Personal voice created but no speakerProfileId was returned.");
  }

  return {
    voiceId: speakerProfileId,
    personalVoiceId,
    raw: pvData,
  };
}

async function cleanupDirectory(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
}

module.exports = async ({ req, res, log, error }) => {
  if (req.method !== "POST") {
    return res.json({ success: false, error: "Method not allowed" }, 405);
  }

  if (!AZURE_SPEECH_KEY) {
    return res.json(
      {
        success: false,
        error: "AZURE_SPEECH_KEY is not configured in function environment.",
      },
      500,
    );
  }

  let workDir = "";

  try {
    const payload = await parseJsonBody(req);
    const samplesBase64 = Array.isArray(payload?.samplesBase64)
      ? payload.samplesBase64
      : [];
    const speakerName = String(payload?.speakerName || "caregiver_voice").trim();

    if (!speakerName) {
      return res.json({ success: false, error: "speakerName is required" }, 400);
    }

    if (samplesBase64.length < 1) {
      return res.json({ success: false, error: "At least one audio sample is required" }, 400);
    }

    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "voice-clone-"));

    const inputPaths = [];
    const wavPaths = [];

    for (let index = 0; index < samplesBase64.length; index += 1) {
      const inputPath = path.join(workDir, `input_${index + 1}.m4a`);
      const wavPath = path.join(workDir, `sample_${index + 1}.wav`);
      await writeBase64File(samplesBase64[index], inputPath);
      await convertToWav(inputPath, wavPath);
      inputPaths.push(inputPath);
      wavPaths.push(wavPath);
    }

    const projectId = await ensureProject();
    const consentId = await createConsent(projectId, speakerName, wavPaths[0]);
    const voice = await createPersonalVoice(projectId, consentId, speakerName, wavPaths);

    return res.json(
      {
        success: true,
        projectId,
        consentId,
        voiceId: voice.voiceId,
        personalVoiceId: voice.personalVoiceId,
      },
      200,
    );
  } catch (err) {
    error(err?.stack || String(err));
    return res.json(
      {
        success: false,
        error: err?.message || "Unknown voice-clone function error",
      },
      500,
    );
  } finally {
    if (workDir) {
      await cleanupDirectory(workDir).catch(() => {});
    }
    log("voice-clone-convert execution finished");
  }
};
