require('dotenv').config();

module.exports = {
  savaram: {
    stt: {
      url: process.env.SAVARAM_STT_URL || 'https://api.sarvam.ai/speech-to-text',
      apiKey: process.env.SAVARAM_STT_KEY,
      model: process.env.SAVARAM_STT_MODEL || 'saarika:v2.5',
      language_code: process.env.SAVARAM_STT_LANGUAGE || 'hi-IN',
    },
    tts: {
      url: process.env.SAVARAM_TTS_URL || 'https://api.sarvam.ai/text-to-speech',
      apiKey: process.env.SAVARAM_TTS_KEY,
      speaker: process.env.SAVARAM_TTS_SPEAKER || 'anushka',
      language_code: process.env.SAVARAM_TTS_LANGUAGE || 'hi-IN',
    },
  },
  webhook: {
    url: process.env.WEBHOOK_URL,
  },
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
};
