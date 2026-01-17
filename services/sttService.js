const axios = require('axios');
const FormData = require('form-data');
const config = require('../config');

/**
 * Convert audio recording to text using Sarvam STT API
 * @param {Buffer|Stream} audioBuffer - Audio file buffer
 * @param {string} mimeType - MIME type of audio (e.g., 'audio/wav', 'audio/mp3')
 * @param {Object} options - Additional options
 * @param {string} options.model - Model to use (default: 'saarika:v2.5')
 * @param {string} options.language_code - Language code (default: 'hi-IN')
 * @returns {Promise<string>} - Converted text
 */
async function convertAudioToText(audioBuffer, mimeType = 'audio/wav', options = {}) {
  try {
    const model = options.model || config.savaram.stt.model || 'saarika:v2.5';
    const language_code = options.language_code || config.savaram.stt.language_code || 'hi-IN';

    const formData = new FormData();
    formData.append('model', model);
    formData.append('language_code', language_code);
    formData.append('file', audioBuffer, {
      contentType: mimeType,
      filename: 'recording.wav',
    });

    console.log(`[STT] Converting audio to text using model: ${model}, language: ${language_code}`);

    const response = await axios.post(config.savaram.stt.url, formData, {
      headers: {
        ...formData.getHeaders(),
        'api-subscription-key': config.savaram.stt.apiKey,
      },
      timeout: 30000,
    });

    // Extract text from Sarvam API response
    const text = response.data.transcript || response.data.text || response.data.result;
    
    if (!text) {
      throw new Error('No transcript returned from STT API');
    }

    console.log('[STT] Successfully converted audio to text');
    console.log(`[STT] Transcript: "${text}"`);
    return text;
  } catch (error) {
    console.error('[STT] Error converting audio to text:', error.message);
    if (error.response?.data) {
      console.error('[STT] API Response:', error.response.data);
    }
    throw new Error(`STT conversion failed: ${error.message}`);
  }
}

module.exports = {
  convertAudioToText,
};
