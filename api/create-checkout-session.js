// /api/create-checkout-session.js
// This endpoint creates a Stripe Checkout session for subscription purchases

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

    // Get the requested pricing tier from the request body
    const { priceId } = req.body;

    // Validate that a valid price ID was provided
    if (!priceId) {
      return res.status(400).json({ error: 'Price ID is required' });
    }

    // Verify it's one of our valid price IDs
    const validPriceIds = [
      process.env.STRIPE_PRICE_STANDARD,
      process.env.STRIPE_PRICE_PRO
    ];

    if (!validPriceIds.includes(priceId)) {
      return res.status(400).json({ error: 'Invalid price ID' });
    }

    // Get user data from Supabase to check for existing Stripe customer
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('stripe_customer_id, email')
      .eq('id', user.id)
      .single();

    if (userError) {
      console.error('Error fetching user data:', userError);
      return res.status(500).json({ error: 'Failed to fetch user data' });
    }

    let customerId = userData.stripe_customer_id;

    // If user doesn't have a Stripe customer ID yet, create one
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.email,
        metadata: {
          supabase_user_id: user.id
        }
      });
      customerId = customer.id;

      // Save the Stripe customer ID to Supabase
      await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // Determine which tier they're purchasing
    const tierName = priceId === process.env.STRIPE_PRICE_STANDARD ? 'Standard' : 'Pro';

    // Create the Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${req.headers.origin || 'https://claritytext.app'}/app.html?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: `${req.headers.origin || 'https://claritytext.app'}/app.html?canceled=true`,
      metadata: {
        supabase_user_id: user.id,
        tier: tierName.toLowerCase()
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          tier: tierName.toLowerCase()
        }
      }
    });

    // Return the checkout session URL
    return res.status(200).json({ 
      url: session.url,
      sessionId: session.id 
    });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ 
      error: 'Failed to create checkout session',
      details: error.message 
    });
  }
}