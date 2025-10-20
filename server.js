const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();

/*
 * Simple Node.js proxy server for the staircase calculator.  This server
 * exposes three API endpoints that forward requests to OpenRouter on the
 * user's behalf.  The API key must be supplied via the OPENROUTER_API_KEY
 * environment variable when the server starts.  Do NOT embed your secret
 * directly into the client‑side HTML; instead, store it securely on the
 * server or in an environment configuration.  When running this server
 * locally, you can create a `.env` file in the same directory containing
 * `OPENROUTER_API_KEY=sk-or-...` to load the key automatically.
 *
 * Endpoints:
 *  - POST /api/chat
 *      Forward a chat conversation to an LLM.  The request body should
 *      contain a `messages` array following the OpenAI/ChatML format and a
 *      `model` name.  Returns the assistant’s reply.
 *  - POST /api/analyze
 *      Accepts an image (Data URL) and an analysis prompt.  Sends both to
 *      a multimodal model which can interpret images.  Returns the textual
 *      analysis.
 *  - POST /api/generate
 *      Accepts an image (Data URL) and a generation prompt.  Sends them to
 *      a multimodal model that can return images.  Returns a Data URL
 *      representing the generated image.
 */

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.warn('Warning: OPENROUTER_API_KEY is not set. The API calls will fail until you set it.');
}

async function callOpenRouter({ model, messages, maxTokens = 1024, temperature = 0.7, n = 1 }) {
  const payload = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
    n,
  };
  // Determine if any message contains an image URL.  If so, set the modalities
  // field required by vision models.  The API will ignore this field if not
  // necessary.
  const hasImage = messages.some(msg => Array.isArray(msg.content) && msg.content.some(c => c.type === 'image_url'));
  if (hasImage) {
    payload.modality = ['image', 'text'];
  }
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://example.com',
    'X-Title': 'Hoszman Stair Calculator Proxy',
  };
  const response = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(payload) });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${response.statusText} - ${err}`);
  }
  const data = await response.json();
  return data;
}

// Chat endpoint: forwards conversation to the selected model and returns the reply.
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model } = req.body;
    if (!messages || !Array.isArray(messages) || !model) {
      return res.status(400).json({ error: 'messages array and model name are required' });
    }
    const result = await callOpenRouter({ model, messages, maxTokens: 1024, temperature: 0.7 });
    const message = result.choices?.[0]?.message?.content ?? '';
    return res.json({ reply: message });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

// Analyze endpoint: accepts an image and prompt, returns textual analysis.
app.post('/api/analyze', async (req, res) => {
  try {
    const { image, prompt, model } = req.body;
    if (!image || !prompt || !model) {
      return res.status(400).json({ error: 'image, prompt and model are required' });
    }
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: image } },
        ],
      },
    ];
    const result = await callOpenRouter({ model, messages, maxTokens: 1024, temperature: 0.3 });
    const message = result.choices?.[0]?.message?.content ?? '';
    return res.json({ analysis: message });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

// Generate endpoint: accepts an image and prompt, returns generated image as Data URL.
app.post('/api/generate', async (req, res) => {
  try {
    const { image, prompt, model } = req.body;
    if (!image || !prompt || !model) {
      return res.status(400).json({ error: 'image, prompt and model are required' });
    }
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: image } },
        ],
      },
    ];
    const result = await callOpenRouter({ model, messages, maxTokens: 1024, temperature: 0.7 });
    // The API returns image URLs in the `images` field for some models.
    const imageUrl = result.images?.[0] ?? result.choices?.[0]?.message?.content;
    return res.json({ image: imageUrl });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

// Serve static files from the public directory (e.g. the HTML file and assets).
app.use(express.static('public'));

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});