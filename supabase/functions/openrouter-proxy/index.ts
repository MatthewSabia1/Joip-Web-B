// Follow this setup guide to integrate the Deno runtime and Supabase functions: https://deno.land/manual/supabase_runtime

import { createClient } from 'npm:@supabase/supabase-js@2.39.8';

// Define required CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// URL for OpenRouter API
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

Deno.serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  // Verify authorization
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid authorization header' }),
      {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    // Parse the incoming request body
    const requestData = await req.json();

    // Create a Supabase client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch the OpenRouter API key from app_settings table
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('app_settings')
      .select('openrouter_api_key, openrouter_model')
      .single();

    if (settingsError) {
      console.error('Error fetching OpenRouter API key:', settingsError);
      return new Response(
        JSON.stringify({ error: 'Failed to retrieve API configuration' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get API key from settings
    const apiKey = settings.openrouter_api_key;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenRouter API key not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Use default model from settings if not specified in request
    if (!requestData.model && settings.openrouter_model) {
      requestData.model = settings.openrouter_model;
    }

    // Forward the request to OpenRouter
    const openRouterResponse = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': req.headers.get('origin') || 'https://joip.app',
        'X-Title': 'Joip AI App'
      },
      body: JSON.stringify(requestData),
    });

    // Return the OpenRouter response
    const openRouterData = await openRouterResponse.json();
    
    return new Response(
      JSON.stringify(openRouterData),
      {
        status: openRouterResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in OpenRouter proxy:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'An error occurred' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}); 