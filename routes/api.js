const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const sttService = require('../services/sttService');
const webhookService = require('../services/webhookService');
const ttsService = require('../services/ttsService');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

/**
 * POST /process-recording-stream
 * Streaming endpoint - sends results progressively as they're ready
 * Uses Server-Sent Events (SSE) to stream responses
 */
router.post('/process-recording-stream', upload.single('audio'), async (req, res) => {
  const requestId = uuidv4();
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const sendEvent = (type, data) => {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Validate file upload
    if (!req.file) {
      sendEvent('error', {
        success: false,
        error: 'No audio file provided',
      });
      res.end();
      return;
    }

    sendEvent('start', {
      requestId: requestId,
      message: 'Processing started',
      timestamp: new Date().toISOString(),
    });

    console.log(`\n[${requestId}] Starting recording processing (STREAMING)...`);
    console.log(`[${requestId}] Received file: ${req.file.originalname} (${req.file.size} bytes)`);

    // Extract optional parameters
    const sttOptions = {
      language_code: req.query.language || req.body.language,
      model: req.query.sttModel || req.body.sttModel,
    };

    // Remove undefined options
    Object.keys(sttOptions).forEach(key => sttOptions[key] === undefined && delete sttOptions[key]);

    // Step 1: Convert audio to text using STT
    console.log(`[${requestId}] Step 1: Converting audio to text using STT...`);
    sendEvent('stt_start', {
      message: 'Converting audio to text...',
    });

    const sttText = await sttService.convertAudioToText(
      req.file.buffer,
      req.file.mimetype || 'audio/wav',
      sttOptions
    );
    console.log(`[${requestId}] STT Result: "${sttText}"`);

    sendEvent('stt_complete', {
      sttText: sttText,
      sttOptions: sttOptions,
    });

    // Step 2: Call webhook with streaming response
    console.log(`[${requestId}] Step 2: Calling webhook with streaming response...`);
    sendEvent('webhook_start', {
      message: 'Calling webhook...',
    });

    const webhookResponses = await webhookService.callWebhookStream(sttText, requestId);
    console.log(`[${requestId}] Webhook returned ${webhookResponses.length} responses`);

    sendEvent('webhook_complete', {
      webhookResponseCount: webhookResponses.length,
    });

    // Step 3: Process webhook responses - accumulate content chunks into complete text
    console.log(`[${requestId}] Step 3: Accumulating webhook responses into complete text...`);
    
    // Extract only 'item' type responses and accumulate content
    let accumulatedText = '';
    for (const webhookResponse of webhookResponses) {
      const content = webhookService.extractTextFromResponse(webhookResponse);
      if (content) {
        accumulatedText += content;
      }
    }

    console.log(`[${requestId}] Accumulated text: "${accumulatedText}"`);

    // Split accumulated text into sentences for TTS conversion
    const sentences = webhookService.splitIntoSentences(accumulatedText);
    console.log(`[${requestId}] Split into ${sentences.length} sentence(s) for TTS conversion`);

    sendEvent('tts_start', {
      message: 'Converting text to speech...',
      totalSentences: sentences.length,
      accumulatedText: accumulatedText,
    });

    // Convert each sentence to speech and stream immediately
    let successCount = 0;
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      
      // Skip very short sentences (single punctuation, etc.)
      if (sentence.trim().length < 2) {
        console.log(`[${requestId}] Skipping short sentence: "${sentence}"`);
        continue;
      }

      try {
        console.log(`[${requestId}] Converting sentence ${i + 1}/${sentences.length}: "${sentence}"`);
        const ttsBase64 = await ttsService.convertTextToSpeech(sentence);

        successCount++;

        // Send result immediately as it's ready
        sendEvent('tts_result', {
          sentenceIndex: successCount,
          sentence: sentence,
          ttsBase64: ttsBase64.substring(0, 100) + '...', // Truncate for preview
          fullTtsBase64: ttsBase64, // Full data
          progress: `${successCount}/${sentences.length}`,
        });

        console.log(`[${requestId}] Streamed sentence ${successCount}/${sentences.length}`);
      } catch (error) {
        console.error(`[${requestId}] Error converting sentence ${i + 1}:`, error.message);
        sendEvent('tts_error', {
          sentenceIndex: i + 1,
          sentence: sentence,
          error: error.message,
        });
      }
    }

    console.log(`[${requestId}] Processing complete. Streamed ${successCount} TTS audio files`);

    sendEvent('complete', {
      requestId: requestId,
      success: true,
      totalSentences: sentences.length,
      successCount: successCount,
      message: 'Processing complete',
      timestamp: new Date().toISOString(),
    });

    res.end();
  } catch (error) {
    console.error(`[${requestId}] Error processing recording:`, error.message);

    sendEvent('error', {
      requestId: requestId,
      success: false,
      error: error.message,
    });

    res.end();
  }
});

/**
 * POST /process-recording
 * Standard endpoint - returns all results after complete processing
 */
router.post('/process-recording', upload.single('audio'), async (req, res) => {
  const requestId = uuidv4();
  
  try {
    // Validate file upload
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No audio file provided',
      });
    }

    console.log(`\n[${requestId}] Starting recording processing...`);
    console.log(`[${requestId}] Received file: ${req.file.originalname} (${req.file.size} bytes)`);

    // Extract optional parameters
    const sttOptions = {
      language_code: req.query.language || req.body.language,
      model: req.query.sttModel || req.body.sttModel,
    };

    // Remove undefined options
    Object.keys(sttOptions).forEach(key => sttOptions[key] === undefined && delete sttOptions[key]);

    // Step 1: Convert audio to text using STT
    console.log(`[${requestId}] Step 1: Converting audio to text using STT...`);
    const sttText = await sttService.convertAudioToText(
      req.file.buffer,
      req.file.mimetype || 'audio/wav',
      sttOptions
    );
    console.log(`[${requestId}] STT Result: "${sttText}"`);

    // Step 2: Call webhook with streaming response
    console.log(`[${requestId}] Step 2: Calling webhook with streaming response...`);
    const webhookResponses = await webhookService.callWebhookStream(sttText, requestId);
    console.log(`[${requestId}] Webhook returned ${webhookResponses.length} responses`);

    // Step 3: Process webhook responses - accumulate content chunks into complete text
    console.log(`[${requestId}] Step 3: Accumulating webhook responses into complete text...`);
    
    // Extract only 'item' type responses and accumulate content
    let accumulatedText = '';
    for (const webhookResponse of webhookResponses) {
      const content = webhookService.extractTextFromResponse(webhookResponse);
      if (content) {
        accumulatedText += content;
      }
    }

    console.log(`[${requestId}] Accumulated text: "${accumulatedText}"`);

    // Split accumulated text into sentences for TTS conversion
    const sentences = webhookService.splitIntoSentences(accumulatedText);
    console.log(`[${requestId}] Split into ${sentences.length} sentence(s) for TTS conversion`);

    // Convert each sentence to speech
    const results = [];
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      
      // Skip very short sentences (single punctuation, etc.)
      if (sentence.trim().length < 2) {
        console.log(`[${requestId}] Skipping short sentence: "${sentence}"`);
        continue;
      }

      console.log(`[${requestId}] Converting sentence ${i + 1}/${sentences.length}: "${sentence}"`);
      const ttsBase64 = await ttsService.convertTextToSpeech(sentence);

      results.push({
        sentenceIndex: results.length + 1,
        sentence: sentence,
        ttsBase64: ttsBase64,
      });
    }

    console.log(`[${requestId}] Processing complete. Generated ${results.length} TTS audio files from accumulated text`);

    res.status(200).json({
      success: true,
      requestId: requestId,
      sttText: sttText,
      sttOptions: sttOptions,
      webhookResponseCount: webhookResponses.length,
      accumulatedText: accumulatedText,
      ttsResponseCount: results.length,
      results: results.map((r) => ({
        sentenceIndex: r.sentenceIndex,
        sentence: r.sentence,
        ttsBase64: r.ttsBase64.substring(0, 100) + '...', // Truncate for response preview
      })),
      fullResults: results, // Include full data
    });
  } catch (error) {
    console.error(`[${requestId}] Error processing recording:`, error.message);

    res.status(500).json({
      success: false,
      requestId: requestId,
      error: error.message,
    });
  }
});

/**
 * POST /process-recording-audio
 * Returns only base64 audio(s) from the complete pipeline
 * Response format: { audios: [base64_1, base64_2, ...] } or single audio as base64
 */
router.post('/process-recording-audio', upload.single('audio'), async (req, res) => {
  const requestId = uuidv4();
  
  try {
    // Validate file upload
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No audio file provided',
      });
    }

    console.log(`\n[${requestId}] Starting audio-only processing...`);
    console.log(`[${requestId}] Received file: ${req.file.originalname} (${req.file.size} bytes)`);

    // Extract optional parameters
    const sttOptions = {
      language_code: req.query.language || req.body.language,
      model: req.query.sttModel || req.body.sttModel,
    };

    // Remove undefined options
    Object.keys(sttOptions).forEach(key => sttOptions[key] === undefined && delete sttOptions[key]);

    // Step 1: Convert audio to text using STT
    console.log(`[${requestId}] Step 1: Converting audio to text using STT...`);
    const sttText = await sttService.convertAudioToText(
      req.file.buffer,
      req.file.mimetype || 'audio/wav',
      sttOptions
    );
    console.log(`[${requestId}] STT Result: "${sttText}"`);

    // Step 2: Call webhook with streaming response
    console.log(`[${requestId}] Step 2: Calling webhook with streaming response...`);
    const webhookResponses = await webhookService.callWebhookStream(sttText, requestId);
    console.log(`[${requestId}] Webhook returned ${webhookResponses.length} responses`);

    // Step 3: Process webhook responses - accumulate content chunks into complete text
    console.log(`[${requestId}] Step 3: Accumulating webhook responses into complete text...`);
    
    // Extract only 'item' type responses and accumulate content
    let accumulatedText = '';
    for (const webhookResponse of webhookResponses) {
      const content = webhookService.extractTextFromResponse(webhookResponse);
      if (content) {
        accumulatedText += content;
      }
    }

    console.log(`[${requestId}] Accumulated text: "${accumulatedText}"`);

    // Split accumulated text into sentences for TTS conversion
    const sentences = webhookService.splitIntoSentences(accumulatedText);
    console.log(`[${requestId}] Split into ${sentences.length} sentence(s) for TTS conversion`);

    // Convert each sentence to speech and collect binary data
    const audioBuffers = [];
    let totalAudioSize = 0;
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      
      // Skip very short sentences (single punctuation, etc.)
      if (sentence.trim().length < 2) {
        console.log(`[${requestId}] Skipping short sentence: "${sentence}"`);
        continue;
      }

      console.log(`[${requestId}] Converting sentence ${i + 1}/${sentences.length}: "${sentence}"`);
      const ttsBase64 = await ttsService.convertTextToSpeech(sentence);
      
      // Convert base64 to buffer
      const buffer = Buffer.from(ttsBase64, 'base64');
      audioBuffers.push(buffer);
      totalAudioSize += buffer.length;
    }

    console.log(`[${requestId}] Processing complete. Generated ${audioBuffers.length} audio files`);

    // Extract audio data from each WAV file and recombine with proper header
    let combinedAudioData = Buffer.alloc(0);
    
    for (const buffer of audioBuffers) {
      // Find the "data" chunk in WAV file
      let dataChunkStart = -1;
      let dataChunkSize = 0;
      
      for (let i = 0; i < buffer.length - 8; i++) {
        // Look for "data" chunk identifier (0x64617461)
        if (buffer[i] === 0x64 && buffer[i+1] === 0x61 && buffer[i+2] === 0x74 && buffer[i+3] === 0x61) {
          dataChunkStart = i + 8; // Skip "data" and size fields
          // Read the size of data chunk (little-endian 32-bit)
          dataChunkSize = buffer.readUInt32LE(i + 4);
          break;
        }
      }
      
      if (dataChunkStart !== -1 && dataChunkSize > 0) {
        const audioData = buffer.slice(dataChunkStart, dataChunkStart + dataChunkSize);
        combinedAudioData = Buffer.concat([combinedAudioData, audioData]);
      }
    }

    // Create a proper WAV header for the combined audio
    const sampleRate = 24000; // Sarvam uses 24kHz
    const numChannels = 1; // Mono
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = combinedAudioData.length;
    const fileSize = 36 + dataSize;

    // Create WAV file
    const wavBuffer = Buffer.alloc(44 + dataSize);
    
    // RIFF header
    wavBuffer.write('RIFF', 0);
    wavBuffer.writeUInt32LE(fileSize, 4);
    wavBuffer.write('WAVE', 8);
    
    // fmt sub-chunk
    wavBuffer.write('fmt ', 12);
    wavBuffer.writeUInt32LE(16, 16); // Subchunk1Size
    wavBuffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
    wavBuffer.writeUInt16LE(numChannels, 22);
    wavBuffer.writeUInt32LE(sampleRate, 24);
    wavBuffer.writeUInt32LE(byteRate, 28);
    wavBuffer.writeUInt16LE(blockAlign, 32);
    wavBuffer.writeUInt16LE(bitsPerSample, 34);
    
    // data sub-chunk
    wavBuffer.write('data', 36);
    wavBuffer.writeUInt32LE(dataSize, 40);
    combinedAudioData.copy(wavBuffer, 44);

    const completeBase64 = wavBuffer.toString('base64');
    
    res.status(200).json({
      success: true,
      requestId: requestId,
      count: audioBuffers.length,
      ttsBase64: completeBase64,
    });

  } catch (error) {
    console.error(`[${requestId}] Error processing recording:`, error.message);

    res.status(500).json({
      success: false,
      requestId: requestId,
      error: error.message,
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
