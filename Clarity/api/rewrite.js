// /api/rewrite.js
// Vercel Serverless Function for Clarity
// This securely calls Claude API without exposing your API key to users

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get text and style from request
  const { text, style } = req.body;

  // Validate input
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'Text is required' });
  }

  if (!style || !['professional', 'friendly', 'direct', 'persuasive'].includes(style)) {
    return res.status(400).json({ error: 'Invalid style' });
  }

  // Your Claude API key (set this in Vercel environment variables)
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // Style-specific system prompts
  const stylePrompts = {
    professional: 'Rewrite this message in a professional, polished tone. Maintain clarity and respect. Use proper grammar and structure.',
    friendly: 'Rewrite this message in a warm, friendly tone. Keep it personable but clear. Use conversational language.',
    direct: 'Rewrite this message in a direct, concise tone. Get straight to the point. Use brief, clear sentences.',
    persuasive: 'Rewrite this message in a persuasive, compelling tone. Make it engaging and convincing while remaining professional.'
  };

  try {
    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `${stylePrompts[style]}\n\nOriginal message:\n${text}\n\nRewritten message:`
          }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Claude API error:', error);
      return res.status(500).json({ error: 'Failed to process message' });
    }

    const data = await response.json();
    
    // Extract the text from Claude's response
    const result = data.content[0].text;

    // Return the rewritten message
    return res.status(200).json({
      result: result,
      style: style
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}