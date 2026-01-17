const axios = require('axios');
const config = require('../config');

/**
 * Convert text to speech using Sarvam TTS API
 * @param {string} text - Text to convert to speech
 * @param {Object} options - Additional options
 * @param {string} options.speaker - Speaker to use (default: anushka)
 * @param {string} options.target_language_code - Language code (default: hi-IN)
 * @param {boolean} options.enable_preprocessing - Enable preprocessing (default: true)
 * @returns {Promise<string>} - Base64 encoded audio
 */
async function convertTextToSpeech(text, options = {}) {
  try {
    const speaker = options.speaker || config.savaram.tts.speaker || 'anushka';
    const target_language_code = options.target_language_code || 'hi-IN';
    const enable_preprocessing = options.enable_preprocessing !== false ? true : false;

    console.log(`[TTS] Converting text to speech using speaker: ${speaker}`);
    console.log(`[TTS] Text: "${text}"`);

    const payload = {
      text: text,
      target_language_code: target_language_code,
      speaker: speaker,
      enable_preprocessing: enable_preprocessing,
    };

    const response = await axios.post(config.savaram.tts.url, payload, {
      headers: {
        'api-subscription-key': config.savaram.tts.apiKey,
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    // Check if response is JSON (contains audio metadata) or raw binary
    let audioData = response.data;

    // Try to parse as JSON to extract audio
    try {
      const jsonResponse = JSON.parse(Buffer.from(response.data).toString('utf8'));
      
      if (jsonResponse.audios && jsonResponse.audios.length > 0) {
        // Audio data is in base64 format in the response
        const base64Audio = jsonResponse.audios[0];
        console.log('[TTS] Successfully extracted audio from JSON response. Base64 length:', base64Audio.length);
        return base64Audio;
      }
    } catch (e) {
      // Not JSON, continue with binary response
    }

    // Convert response to base64
    const base64Audio = Buffer.from(audioData).toString('base64');

    console.log('[TTS] Successfully converted text to speech. Base64 length:', base64Audio.length);
    return base64Audio;
  } catch (error) {
    console.error('[TTS] Error converting text to speech:', error.message);
    if (error.response?.data) {
      console.error('[TTS] API Response:', error.response.data.toString());
    }
    throw new Error(`TTS conversion failed: ${error.message}`);
  }
}

/**
 * Convert multiple texts to speech
 * @param {Array<string>} texts - Array of texts to convert
 * @returns {Promise<Array<string>>} - Array of base64 encoded audios
 */
async function convertMultipleTextsToSpeech(texts) {
  try {
    const results = [];

    for (const text of texts) {
      const base64Audio = await convertTextToSpeech(text);
      results.push(base64Audio);
    }

    return results;
  } catch (error) {
    console.error('[TTS] Error converting multiple texts:', error.message);
    throw error;
  }
}

module.exports = {
  convertTextToSpeech,
  convertMultipleTextsToSpeech,
};
