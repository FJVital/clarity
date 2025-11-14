// /api/stripe-webhook.js
// This endpoint receives events from Stripe when subscriptions are created, updated, or canceled

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// This is important for webhook verification - we need the raw body
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper function to get raw body from request
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let event;

  try {
    // Get the raw body for signature verification
    const rawBody = await getRawBody(req);
    const signature = req.headers['stripe-signature'];

    // Verify the webhook signature to ensure it's from Stripe
    // This prevents attackers from sending fake webhook events
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  console.log('Received webhook event:', event.type);

  // Handle different event types
  try {
    switch (event.type) {
      // When a checkout session is completed (payment successful)
      case 'checkout.session.completed': {
        const session = event.data.object;
        
        // Get the subscription ID and user ID from metadata
        const subscriptionId = session.subscription;
        const userId = session.metadata.supabase_user_id;
        const tier = session.metadata.tier; // 'standard' or 'pro'

        console.log(`Checkout completed for user ${userId}, tier: ${tier}`);

        // Update user's tier and subscription ID in Supabase
        const { error } = await supabase
          .from('users')
          .update({
            tier: tier,
            stripe_subscription_id: subscriptionId,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);

        if (error) {
          console.error('Error updating user tier:', error);
        } else {
          console.log(`Successfully upgraded user ${userId} to ${tier}`);
        }
        break;
      }

      // When a subscription is updated (e.g., plan change)
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const userId = subscription.metadata.supabase_user_id;
        const tier = subscription.metadata.tier;

        console.log(`Subscription updated for user ${userId}, tier: ${tier}`);

        // Update user's tier in Supabase
        const { error } = await supabase
          .from('users')
          .update({
            tier: tier,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);

        if (error) {
          console.error('Error updating user tier:', error);
        }
        break;
      }

      // When a subscription is canceled or expires
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId = subscription.metadata.supabase_user_id;

        console.log(`Subscription deleted for user ${userId}`);

        // Downgrade user back to free tier
        const { error } = await supabase
          .from('users')
          .update({
            tier: 'free',
            stripe_subscription_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('stripe_subscription_id', subscription.id);

        if (error) {
          console.error('Error downgrading user:', error);
        } else {
          console.log(`Successfully downgraded user ${userId} to free`);
        }
        break;
      }

      // When an invoice payment succeeds (monthly renewal)
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;

        console.log(`Invoice paid for subscription ${subscriptionId}`);
        
        // Optional: You can log this or send a "payment successful" email
        // The user's subscription remains active automatically
        break;
      }

      // When an invoice payment fails
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;

        console.log(`Invoice payment failed for subscription ${subscriptionId}`);
        
        // Optional: Send a payment failure email to the user
        // Stripe will automatically retry the payment
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}