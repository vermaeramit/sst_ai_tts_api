const axios = require('axios');
const config = require('../config');

/**
 * Call webhook with text and process streaming response line by line
 * @param {string} text - Text to send to webhook
 * @param {string} requestId - Request ID for tracking
 * @returns {Promise<Array>} - Array of responses, one per line from webhook
 */
async function callWebhookStream(text, requestId) {
  try {
    const responses = [];

    const response = await axios.post(
      config.webhook.url,
      {
        message: text,
        sessionId: requestId,
      },
      {
        timeout: 60000,
        responseType: 'stream',
      }
    );

    // Handle streaming response
    return new Promise((resolve, reject) => {
      let buffer = '';

      response.data.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        
        // Process complete lines
        const lines = buffer.split('\n');
        
        // Keep the last incomplete line in buffer
        buffer = lines.pop();

        lines.forEach((line) => {
          if (line.trim()) {
            try {
              // Try to parse as JSON (common in streaming APIs)
              const parsed = JSON.parse(line);
              responses.push(parsed);
              console.log('[Webhook] Received line:', parsed);
            } catch (e) {
              // If not JSON, treat as plain text
              responses.push({ text: line.trim() });
              console.log('[Webhook] Received text line:', line.trim());
            }
          }
        });
      });

      response.data.on('end', () => {
        // Process any remaining data in buffer
        if (buffer.trim()) {
          try {
            const parsed = JSON.parse(buffer);
            responses.push(parsed);
          } catch (e) {
            responses.push({ text: buffer.trim() });
          }
        }

        console.log(`[Webhook] Stream ended. Received ${responses.length} responses`);
        resolve(responses);
      });

      response.data.on('error', reject);
    });
  } catch (error) {
    console.error('[Webhook] Error calling webhook:', error.message);
    throw new Error(`Webhook call failed: ${error.message}`);
  }
}

/**
 * Extract text from webhook response object
 * Handles streaming JSON with 'type' and 'content' fields
 * @param {Object} response - Response object from webhook
 * @returns {string|null} - Extracted text or null if not an item
 */
function extractTextFromResponse(response) {
  // Skip non-item responses (begin, end, etc.)
  if (response.type && response.type !== 'item') {
    return null;
  }

  // For item responses, extract content
  if (response.content) {
    return response.content;
  }

  if (typeof response === 'string') {
    return response;
  }
  
  if (response.text) {
    return response.text;
  }
  
  if (response.message) {
    return response.message;
  }

  return null;
}

/**
 * Split text into sentences
 * Handles multiple scenarios:
 * 1. Splits on sentence punctuation: . ! ? । ॥ ) with optional following punctuation
 * 2. Splits on newlines if no punctuation
 * 3. Splits on word boundaries if text is too long
 * 4. Returns whole text as single sentence if nothing else works
 * @param {string} text - Text to split
 * @returns {Array<string>} - Array of sentences
 */
function splitIntoSentences(text) {
  if (!text || text.trim().length === 0) return [];

  text = text.trim();

  // First try: Split on sentence punctuation (. ! ? । ॥ ) or closing parenthesis)
  // This regex captures text up to and including sentence-ending punctuation
  let sentences = text.match(/[^.!?।॥)\n]+[.!?।॥)]+/g);
  if (sentences && sentences.length > 0) {
    return sentences
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  // Second try: Split on newlines
  sentences = text.split('\n');
  if (sentences.length > 1) {
    return sentences
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  // Third try: If text is long, split on multiple spaces or word boundaries
  if (text.length > 100) {
    // Split on 2+ spaces or common word boundaries
    sentences = text.split(/\s{2,}|\s+(?=[A-Z])/);
    if (sentences.length > 1) {
      return sentences
        .map(s => s.trim())
        .filter(s => s.length > 0);
    }
  }

  // Fallback: Return the whole text as a single sentence
  return [text];
}

module.exports = {
  callWebhookStream,
  extractTextFromResponse,
  splitIntoSentences,
};
