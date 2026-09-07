import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const MAX_BODY_BYTES = 16 * 1024;

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('request_too_large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('invalid_json'));
      }
    });
    request.on('error', reject);
  });
}

function runYtDlp(url, outputTemplate) {
  const executable = process.env.YT_DLP_PATH || 'yt-dlp';
  const args = [
    '--no-playlist',
    '--no-progress',
    '--no-warnings',
    '--format', 'bestaudio/best',
    '--extract-audio',
    '--audio-format', 'm4a',
    '--audio-quality', '0',
    '--max-filesize', '200M',
    '--output', outputTemplate,
    '--print', 'after_move:filepath',
    url
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error('yt_dlp_missing'));
      } else {
        reject(error);
      }
    });
    child.on('close', (code) => {
      if (code !== 0) {
        const error = new Error('yt_dlp_failed');
        error.details = stderr.trim();
        reject(error);
        return;
      }

      const outputPath = stdout.trim().split('\n').filter(Boolean).at(-1);
      if (!outputPath) {
        reject(new Error('missing_output'));
        return;
      }
      resolve(outputPath);
    });
  });
}

function friendlyError(error) {
  const details = error.details || '';

  if (error.message === 'yt_dlp_missing') {
    return 'ميزة الروابط تحتاج تثبيت yt-dlp على الجهاز الذي يشغّل الخادم.';
  }
  if (/unsupported url/i.test(details)) {
    return 'هذا الموقع أو الرابط غير مدعوم حاليًا.';
  }
  if (/private video|login required|sign in|cookies/i.test(details)) {
    return 'المقطع خاص أو يتطلب تسجيل دخول، لذلك لا يمكن جلبه.';
  }
  if (/video unavailable|not available/i.test(details)) {
    return 'المقطع غير متاح أو حُذف من المصدر.';
  }
  if (/larger than max-filesize|file is larger/i.test(details)) {
    return 'حجم الصوت يتجاوز الحد المسموح وهو ٢٠٠ م.ب.';
  }
  return 'تعذر استخراج الصوت. تحقق أن الرابط عام وصحيح ثم حاول مجددًا.';
}

function mimeTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.opus': 'audio/ogg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.webm': 'audio/webm'
  }[extension] || 'application/octet-stream';
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

function mediaAudioMiddleware() {
  return async (request, response, next) => {
    if (request.method !== 'POST') {
      if (request.method === 'GET') {
        sendJson(response, 200, { available: true });
        return;
      }
      next();
      return;
    }

    let workDirectory;
    try {
      const body = await readJsonBody(request);
      let url;
      try {
        url = new URL(body.url);
      } catch {
        sendJson(response, 400, { message: 'أدخل رابطًا صحيحًا يبدأ بـ http أو https.' });
        return;
      }
      if (!['http:', 'https:'].includes(url.protocol)) {
        sendJson(response, 400, { message: 'الرابط يجب أن يبدأ بـ http أو https.' });
        return;
      }

      workDirectory = await mkdtemp(path.join(tmpdir(), 'pdf-to-mp4-audio-'));
      const outputPath = await runYtDlp(
        url.href,
        path.join(workDirectory, '%(title).120B.%(ext)s')
      );
      const fileStats = await stat(outputPath);
      const fileName = path.basename(outputPath);

      response.statusCode = 200;
      response.setHeader('Content-Type', mimeTypeFor(outputPath));
      response.setHeader('Content-Length', String(fileStats.size));
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Media-Filename', encodeURIComponent(fileName));

      const stream = createReadStream(outputPath);
      stream.on('error', () => {
        if (!response.headersSent) sendJson(response, 500, { message: 'تعذر قراءة الملف الصوتي.' });
        else response.destroy();
      });
      response.on('close', () => {
        rm(workDirectory, { recursive: true, force: true }).catch(() => {});
      });
      stream.pipe(response);
    } catch (error) {
      if (workDirectory) {
        await rm(workDirectory, { recursive: true, force: true }).catch(() => {});
      }
      if (!response.headersSent) {
        sendJson(response, 422, { message: friendlyError(error) });
      }
    }
  };
}

export function mediaAudioPlugin() {
  const installMiddleware = (server) => {
    server.middlewares.use('/api/media-audio', mediaAudioMiddleware());
  };

  return {
    name: 'media-audio-api',
    configureServer: installMiddleware,
    configurePreviewServer: installMiddleware
  };
}
