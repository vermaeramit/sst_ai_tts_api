# STT-TTS Webhook API

## Configuration

Create a `.env` file in the root directory with the following variables:

```
# Savaram STT API
SAVARAM_STT_URL=https://your-savaram-stt-endpoint.com/api/stt
SAVARAM_STT_KEY=your-stt-api-key

# Savaram TTS API
SAVARAM_TTS_URL=https://your-savaram-tts-endpoint.com/api/tts
SAVARAM_TTS_KEY=your-tts-api-key

# Webhook
WEBHOOK_URL=https://your-webhook.com/endpoint

# Server
PORT=3000
```

## Installation

```bash
npm install
```

## Running

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

## API Usage

### 1. POST /api/process-recording (Standard - All at once)

Upload a recording file and get complete response after all processing is done.

**Request:**
```bash
curl -X POST http://localhost:3000/api/process-recording \
  -F "audio=@/path/to/audio.wav"
```

**Response:**
```json
{
  "success": true,
  "requestId": "uuid",
  "sttText": "हेलो",
  "accumulatedText": "Namaste! Kaise madad kar sakta hoon?",
  "ttsResponseCount": 2,
  "results": [
    {
      "sentenceIndex": 1,
      "sentence": "Namaste!",
      "ttsBase64": "..."
    },
    {
      "sentenceIndex": 2,
      "sentence": "Kaise madad kar sakta hoon?",
      "ttsBase64": "..."
    }
  ]
}
```

---

### 2. POST /api/process-recording-stream (Streaming - Progressive)

Upload a recording file and receive results progressively as they're ready using Server-Sent Events (SSE).

**Request:**
```bash
curl -X POST http://localhost:3000/api/process-recording-stream \
  -F "audio=@/path/to/audio.wav"
```

**Response (Server-Sent Events stream):**
```
event: start
data: {"requestId":"...","message":"Processing started"}

event: stt_complete
data: {"sttText":"हेलो"}

event: webhook_complete
data: {"webhookResponseCount":32}

event: tts_start
data: {"totalSentences":4,"accumulatedText":"..."}

event: tts_result
data: {"sentenceIndex":1,"sentence":"Namaste!","fullTtsBase64":"..."}

event: tts_result
data: {"sentenceIndex":2,"sentence":"Kaise madad kar sakta hoon?","fullTtsBase64":"..."}

event: complete
data: {"success":true,"successCount":4}
```

**JavaScript Client Example:**
```javascript
const eventSource = new EventSource('/api/process-recording-stream');

eventSource.addEventListener('tts_result', (event) => {
  const data = JSON.parse(event.data);
  console.log(`Sentence ${data.sentenceIndex}: ${data.sentence}`);
  // Play audio using base64: data.fullTtsBase64
  const audio = new Audio('data:audio/wav;base64,' + data.fullTtsBase64);
  audio.play();
});

eventSource.addEventListener('complete', (event) => {
  eventSource.close();
  console.log('Done!');
});

eventSource.addEventListener('error', (event) => {
  const data = JSON.parse(event.data);
  console.error(data.error);
  eventSource.close();
});
```

---

### Query Parameters (Optional for both endpoints)

- `language` - Language code for STT (default: `hi-IN`)
- `sttModel` - STT model to use (default: `saarika:v2.5`)

**Example:**
```bash
curl -X POST "http://localhost:3000/api/process-recording-stream?language=en-IN" \
  -F "audio=@audio.wav"
```

**Response:**
```json
{
  "success": true,
  "requestId": "uuid",
  "results": [
    {
      "webhookResponse": "text from webhook",
      "ttsBase64": "base64-encoded-audio"
    }
  ]
}
```
