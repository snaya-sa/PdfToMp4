import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export class VideoEncoder {
  constructor() {
    this.ffmpeg = new FFmpeg();
    this.loaded = false;
  }

  /**
   * Load FFmpeg WASM
   * @param {function} onProgress - Progress callback for loading
   */
  async load(onProgress = null) {
    if (this.loaded) return;

    this.ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });

    this.ffmpeg.on('progress', ({ progress }) => {
      if (onProgress) {
        onProgress(Math.round(progress * 100));
      }
    });

    // Load ffmpeg core from CDN
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

    await this.ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    this.loaded = true;
  }

  /**
   * Create video from image blobs
   * @param {Blob[]} imageBlobs - Array of image blobs (one per page)
   * @param {Object} options - Video options
   * @param {number} options.duration - Duration per image in seconds
   * @param {number} options.fps - Frames per second
   * @param {number} options.width - Output width (will be made even)
   * @param {number} options.height - Output height (will be made even)
   * @param {function} onProgress - Progress callback
   * @returns {Promise<Blob>} - The video blob
   */
  async createVideoFromImages(imageBlobs, options, onProgress = null) {
    const { duration = 3, fps = 30, width = 1280, height = 720 } = options;

    // Ensure dimensions are even (required by h264)
    const evenWidth = width % 2 === 0 ? width : width + 1;
    const evenHeight = height % 2 === 0 ? height : height + 1;

    // Write images to FFmpeg virtual filesystem
    for (let i = 0; i < imageBlobs.length; i++) {
      const fileName = `img${String(i).padStart(4, '0')}.png`;
      await this.ffmpeg.writeFile(fileName, await fetchFile(imageBlobs[i]));

      if (onProgress) {
        onProgress('كتابة الصور', Math.round((i + 1) / imageBlobs.length * 30));
      }
    }

    // Create video from images
    // Using -framerate to set input framerate (1/duration = images per second)
    const inputFramerate = 1 / duration;

    await this.ffmpeg.exec([
      '-framerate', String(inputFramerate),
      '-i', 'img%04d.png',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-vf', `scale=${evenWidth}:${evenHeight}:force_original_aspect_ratio=decrease,pad=${evenWidth}:${evenHeight}:(ow-iw)/2:(oh-ih)/2:white`,
      '-r', String(fps),
      '-preset', 'fast',
      '-crf', '23',
      'video_no_audio.mp4'
    ]);

    if (onProgress) {
      onProgress('إنشاء الفيديو', 70);
    }

    // Read the output video
    const videoData = await this.ffmpeg.readFile('video_no_audio.mp4');

    // Clean up images
    for (let i = 0; i < imageBlobs.length; i++) {
      const fileName = `img${String(i).padStart(4, '0')}.png`;
      await this.ffmpeg.deleteFile(fileName);
    }

    return new Blob([videoData.buffer], { type: 'video/mp4' });
  }

  /**
   * Extract audio from a video file
   * @param {File|Blob} videoFile - The video file
   * @returns {Promise<Blob>} - Audio blob (AAC)
   */
  async extractAudioFromVideo(videoFile) {
    const inputName = 'input_video' + this.getExtension(videoFile);
    await this.ffmpeg.writeFile(inputName, await fetchFile(videoFile));

    await this.ffmpeg.exec([
      '-i', inputName,
      '-vn',
      '-acodec', 'aac',
      '-b:a', '192k',
      'extracted_audio.aac'
    ]);

    const audioData = await this.ffmpeg.readFile('extracted_audio.aac');

    // Clean up
    await this.ffmpeg.deleteFile(inputName);
    await this.ffmpeg.deleteFile('extracted_audio.aac');

    return new Blob([audioData.buffer], { type: 'audio/aac' });
  }

  /**
   * Add audio to video
   * @param {Blob} videoBlob - The video blob
   * @param {File|Blob} audioFile - The audio file (can be audio or video file)
   * @param {Object} options - Audio options
   * @param {boolean} options.loop - Loop audio if shorter than video
   * @param {number} options.volume - Volume level (0-1)
   * @param {function} onProgress - Progress callback
   * @returns {Promise<Blob>} - Final video with audio
   */
  async addAudioToVideo(videoBlob, audioFile, options, onProgress = null) {
    const { loop = true, volume = 1 } = options;

    // Write video
    await this.ffmpeg.writeFile('input_video.mp4', await fetchFile(videoBlob));

    // Determine if audio file is a video (needs extraction)
    const isVideoFile = audioFile.type.startsWith('video/');
    let audioInputName;

    if (isVideoFile) {
      // Extract audio from video
      if (onProgress) onProgress('استخراج الصوت من الفيديو', 10);

      const ext = this.getExtension(audioFile);
      audioInputName = 'source_video' + ext;
      await this.ffmpeg.writeFile(audioInputName, await fetchFile(audioFile));

      await this.ffmpeg.exec([
        '-i', audioInputName,
        '-vn',
        '-acodec', 'aac',
        '-b:a', '192k',
        'input_audio.aac'
      ]);

      await this.ffmpeg.deleteFile(audioInputName);
      audioInputName = 'input_audio.aac';
    } else {
      // Use audio file directly
      const ext = this.getExtension(audioFile);
      audioInputName = 'input_audio' + ext;
      await this.ffmpeg.writeFile(audioInputName, await fetchFile(audioFile));
    }

    if (onProgress) onProgress('دمج الصوت مع الفيديو', 50);

    // Build FFmpeg command
    const ffmpegArgs = ['-i', 'input_video.mp4'];

    if (loop) {
      ffmpegArgs.push('-stream_loop', '-1');
    }

    ffmpegArgs.push('-i', audioInputName);

    // Volume filter
    if (volume !== 1) {
      ffmpegArgs.push('-filter:a', `volume=${volume}`);
    }

    ffmpegArgs.push(
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-map', '0:v:0',
      '-map', '1:a:0',
      'output_final.mp4'
    );

    await this.ffmpeg.exec(ffmpegArgs);

    if (onProgress) onProgress('إنهاء المعالجة', 90);

    // Read final output
    const finalData = await this.ffmpeg.readFile('output_final.mp4');

    // Clean up
    await this.ffmpeg.deleteFile('input_video.mp4');
    await this.ffmpeg.deleteFile(audioInputName);
    await this.ffmpeg.deleteFile('output_final.mp4');

    return new Blob([finalData.buffer], { type: 'video/mp4' });
  }

  /**
   * Get video duration
   * @param {Blob} videoBlob - The video blob
   * @returns {Promise<number>} - Duration in seconds
   */
  async getVideoDuration(videoBlob) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };
      video.src = URL.createObjectURL(videoBlob);
    });
  }

  /**
   * Get audio/video file duration
   * @param {File|Blob} file - The audio or video file
   * @returns {Promise<number>} - Duration in seconds
   */
  async getMediaDuration(file) {
    return new Promise((resolve, reject) => {
      const media = document.createElement(
        file.type.startsWith('video/') ? 'video' : 'audio'
      );
      media.preload = 'metadata';
      media.onloadedmetadata = () => {
        URL.revokeObjectURL(media.src);
        resolve(media.duration);
      };
      media.onerror = () => {
        reject(new Error('فشل في قراءة مدة الملف'));
      };
      media.src = URL.createObjectURL(file);
    });
  }

  /**
   * Get file extension
   * @param {File|Blob} file - The file
   * @returns {string} - Extension with dot
   */
  getExtension(file) {
    if (file.name) {
      const match = file.name.match(/\.[^.]+$/);
      return match ? match[0] : '.bin';
    }
    // Guess from MIME type
    const mimeToExt = {
      'audio/mpeg': '.mp3',
      'audio/mp3': '.mp3',
      'audio/wav': '.wav',
      'audio/ogg': '.ogg',
      'audio/aac': '.aac',
      'audio/m4a': '.m4a',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/quicktime': '.mov',
    };
    return mimeToExt[file.type] || '.bin';
  }

  /**
   * Clean up FFmpeg resources
   */
  terminate() {
    if (this.ffmpeg) {
      this.ffmpeg.terminate();
      this.loaded = false;
    }
  }
}

/**
 * Quality presets
 */
export const QualityPresets = {
  high: { width: 1920, height: 1080 },
  medium: { width: 1280, height: 720 },
  low: { width: 854, height: 480 }
};
