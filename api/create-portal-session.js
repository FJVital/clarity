// /api/create-portal-session.js
// This endpoint creates a Stripe Customer Portal session for subscription management

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the authorization token from request headers
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify the user's authentication with Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Get user data from Supabase to find Stripe customer ID
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.stripe_customer_id) {
      return res.status(400).json({ error: 'No subscription found' });
    }

    // Create a Customer Portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: userData.stripe_customer_id,
      return_url: `${req.headers.origin || 'https://claritytext.app'}/app.html`,
    });

    // Return the portal URL
    return res.status(200).json({ url: session.url });

  } catch (error) {
    console.error('Error creating portal session:', error);
    return res.status(500).json({ 
      error: 'Failed to create portal session',
      details: error.message 
    });
  }
}