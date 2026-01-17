const express = require('express');
const config = require('./config');
const apiRoutes = require('./routes/api');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static('public'));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'STT-TTS Webhook API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      processRecording: 'POST /api/process-recording',
    },
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// Start server
const PORT = config.server.port;
app.listen(PORT, () => {
  console.log(`\n✓ Server is running on http://localhost:${PORT}`);
  console.log(`✓ Environment: ${config.server.nodeEnv}`);
  console.log(`✓ Savaram STT URL: ${config.savaram.stt.url}`);
  console.log(`✓ Savaram TTS URL: ${config.savaram.tts.url}`);
  console.log(`✓ Webhook URL: ${config.webhook.url}`);
  console.log(`\nReady to process recordings...\n`);
});

module.exports = app;
