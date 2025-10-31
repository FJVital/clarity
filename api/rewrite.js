// api/rewrite.js
// Serverless function for Vercel - FIXED VERSION

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { text, style } = req.body;
    
    // Validate input
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    if (!style) {
      return res.status(400).json({ error: 'Style is required' });
    }
    
    // Check environment variables
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    // Check if user is authenticated
    const authHeader = req.headers.authorization;
    let userId = null;
    let userTier = 'free';
    let userData = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      try {
        // Verify the token with Supabase
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        
        if (user && !authError) {
          userId = user.id;
          
          // Get user data from database
          const { data: userRecord, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
          
          if (userRecord && !userError) {
            userData = userRecord;
            userTier = userData.tier || 'free';
            
            // Check usage limits for free tier
            if (userTier === 'free') {
              const today = new Date().toISOString().split('T')[0];
              
              // Reset counter if it's a new day
              if (userData.last_rewrite_date !== today) {
                await supabase
                  .from('users')
                  .update({
                    rewrites_today: 0,
                    last_rewrite_date: today
                  })
                  .eq('id', userId);
                
                userData.rewrites_today = 0;
              }
              
              // Check if user has reached daily limit
              if (userData.rewrites_today >= 10) {
                return res.status(429).json({
                  error: 'Daily limit reached',
                  message: 'You\'ve used all 10 free rewrites today. Upgrade to Pro for unlimited access.',
                  remaining: 0
                });
              }
            }
          }
        }
      } catch (authErr) {
        console.error('Auth error:', authErr);
        // Continue without auth - treat as logged out user
      }
    }
    
    // Call Claude API
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: getPromptForStyle(text, style)
        }]
      })
    });
    
    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error('Claude API error:', errorText);
      return res.status(500).json({ error: 'AI service error', details: errorText });
    }
    
    const claudeData = await claudeResponse.json();
    const rewrittenText = claudeData.content[0].text;
    
    // If user is logged in, update usage and save to history
    if (userId && userData) {
      try {
        // Increment rewrite counter
        await supabase
          .from('users')
          .update({
            rewrites_today: (userData.rewrites_today || 0) + 1,
            rewrites_total: (userData.rewrites_total || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);
        
        // Save to rewrite history
        await supabase
          .from('rewrites')
          .insert({
            user_id: userId,
            input_text: text,
            output_text: rewrittenText,
            style: style
          });
      } catch (dbError) {
        console.error('Database error:', dbError);
        // Don't fail the request if database update fails
      }
    }
    
    return res.status(200).json({
      result: rewrittenText,
      remaining: userTier === 'free' && userData ? (10 - ((userData.rewrites_today || 0) + 1)) : 999
    });
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

// Get the appropriate prompt based on style
function getPromptForStyle(text, style) {
  const stylePrompts = {
    professional: `Transform this rough message into a professional, polished communication. Maintain the key points and intent, but make it business-appropriate and clear. Do not add greetings or closings unless they're in the original.

Input:
${text}

Transform this into a professional message:`,
    
    friendly: `Transform this message into a warm, friendly communication. Keep it natural and conversational while being clear. Do not add greetings or closings unless they're in the original.

Input:
${text}

Transform this into a friendly message:`,
    
    direct: `Transform this into a clear, concise, direct message. Get straight to the point. Remove unnecessary words while being respectful. Do not add greetings or closings unless they're in the original.

Input:
${text}

Transform this into a direct message:`,
    
    persuasive: `Transform this into a persuasive, compelling message. Emphasize benefits and create a clear call to action while remaining authentic. Do not add greetings or closings unless they're in the original.

Input:
${text}

Transform this into a persuasive message:`
  };
  
  return stylePrompts[style] || stylePrompts.professional;
}
