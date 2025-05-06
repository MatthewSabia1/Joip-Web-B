// Follow this setup guide to integrate the Deno runtime and Supabase functions: https://deno.land/manual/supabase_runtime

import { createClient } from "npm:@supabase/supabase-js@2.39.8";
import { patreon as patreonAPI } from "npm:patreon@0.4.1";
import queryString from "npm:query-string@9.0.0";

interface PatreonTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface PatreonUserData {
  id: string;
  attributes: {
    email: string;
    full_name: string;
    image_url: string;
    is_email_verified: boolean;
  };
  relationships: {
    memberships: {
      data: Array<{
        id: string;
        type: string;
      }>;
    };
  };
}

interface PatreonMemberData {
  id: string;
  attributes: {
    patron_status: string;
    currently_entitled_amount_cents: number;
    will_pay_amount_cents: number;
    last_charge_date: string | null;
    last_charge_status: string | null;
  };
  relationships: {
    currently_entitled_tiers: {
      data: Array<{
        id: string;
        type: string;
      }>;
    };
  };
}

interface WebhookEvent {
  data: {
    id: string;
    type: string;
    attributes: Record<string, any>;
  };
  included: Array<{
    id: string;
    type: string;
    attributes: Record<string, any>;
  }>;
}

// Read secrets from environment variables
const PATREON_CLIENT_ID = Deno.env.get("PATREON_CLIENT_ID");
const PATREON_CLIENT_SECRET = Deno.env.get("PATREON_CLIENT_SECRET");
// Note: CREATOR tokens likely not needed directly in this function unless performing creator-specific actions not shown.
// If needed for webhook verification or other calls, add PATREON_WEBHOOK_SECRET here.
// const CREATOR_ACCESS_TOKEN = Deno.env.get("PATREON_CREATOR_ACCESS_TOKEN");
// const CREATOR_REFRESH_TOKEN = Deno.env.get("PATREON_CREATOR_REFRESH_TOKEN");
const PATREON_WEBHOOK_SECRET = Deno.env.get("PATREON_WEBHOOK_SECRET"); // Needed for webhook verification

// Define the correct redirect URI based on the Supabase URL
const SUPABASE_URL = Deno.env.get("SUPABASE_URL"); // Already read from env
if (!SUPABASE_URL) {
  console.error("Critical Error: SUPABASE_URL environment variable is not set.");
  // In a real scenario, you might throw or return a specific error response
}
// IMPORTANT: For local development using `supabase start`, ensure PATREON_CLIENT_ID, PATREON_CLIENT_SECRET, SUPABASE_URL, etc.
// are set in `supabase/.env.local`. Also, you MUST configure the local callback URL
// (e.g., "http://localhost:<supabase-port>/functions/v1/patreon-auth/callback")
// as a valid Redirect URI in your Patreon application settings.
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/patreon-auth/callback`;

// Define the frontend app URL for redirects
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "http://localhost:5173"; // Fallback to common local dev port

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req) => {
  console.log("[PatreonAuthFunction] Called with method:", req.method);
  console.log("[PatreonAuthFunction] URL:", req.url);

  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Get the URL object to parse the path and params
  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();
  
  console.log("[PatreonAuthFunction] Path:", path);

  try {
    // Check for missing critical environment variables
    if (!PATREON_CLIENT_ID || !PATREON_CLIENT_SECRET || !SUPABASE_URL) {
      console.error("Missing critical environment variables: PATREON_CLIENT_ID, PATREON_CLIENT_SECRET, or SUPABASE_URL");
      return new Response(
        JSON.stringify({ error: "Server configuration error: Missing required environment variables." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create a Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Handle OAuth callback
    if (path === "callback") {
      const params = queryString.parse(url.search);
      const code = params.code as string;
      const state = params.state as string;
      
      console.log("[PatreonAuthFunction] Processing callback with code and state:", !!code, !!state);
      console.log("[PatreonAuthFunction] State value:", state);
      
      if (!code) {
        return new Response(
          JSON.stringify({ error: "No code provided" }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      // Exchange authorization code for tokens
      console.log("[PatreonAuthFunction] Exchanging code for Patreon tokens");
      const tokenResponse = await fetch("https://www.patreon.com/api/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: queryString.stringify({
          code,
          grant_type: "authorization_code",
          client_id: PATREON_CLIENT_ID,
          client_secret: PATREON_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("[PatreonAuthFunction] Token exchange error:", errorText);
        try {
          const error = JSON.parse(errorText);
          return new Response(
            JSON.stringify({ error: "Failed to exchange code for tokens", details: error }),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        } catch (e) {
          return new Response(
            JSON.stringify({ error: "Failed to exchange code for tokens", rawResponse: errorText }),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        }
      }

      const tokens = await tokenResponse.json() as PatreonTokenResponse;
      console.log("[PatreonAuthFunction] Received tokens from Patreon");
      
      try {
        // Get user data using the access token
        const patreonAPIClient = patreonAPI(tokens.access_token);
        const userResponse = await patreonAPIClient('/identity?include=memberships&fields[user]=email,full_name,image_url,is_email_verified&fields[member]=patron_status,currently_entitled_amount_cents,will_pay_amount_cents,last_charge_date,last_charge_status&fields[tier]=title,amount_cents');
        
        const userData = userResponse.data as PatreonUserData;
        console.log("[PatreonAuthFunction] Retrieved Patreon user data:", userData.id);
        
        const memberData = userResponse.included?.[0] as PatreonMemberData | undefined;
        
        // Determine patron tier based on amount
        let patronTier = null;
        if (memberData) {
          const amountCents = memberData.attributes.currently_entitled_amount_cents;
          if (amountCents >= 1000) {
            patronTier = "premium";
          } else if (amountCents >= 500) {
            patronTier = "basic";
          }
        }

        // We need to retrieve the user from the Supabase database using the email
        // since the state parameter might not be reliable
        const { data: userProfiles, error: userLookupError } = await supabaseClient
          .from('profiles')
          .select('id')
          .eq('email', userData.attributes.email)
          .limit(1);

        if (userLookupError || !userProfiles || userProfiles.length === 0) {
          console.error("[PatreonAuthFunction] Error finding user by email:", userLookupError || "No user found");
          // Redirect to frontend with error
          return new Response(null, {
            status: 302,
            headers: {
              ...corsHeaders,
              "Location": `${FRONTEND_URL}/?patreonError=user_not_found`,
            },
          });
        }

        const userId = userProfiles[0].id;
        console.log("[PatreonAuthFunction] Found user ID from email:", userId);

        // Update the user's profile with Patreon information
        const { error: updateError } = await supabaseClient
          .from('profiles')
          .update({
            is_patron: memberData?.attributes.patron_status === 'active_patron',
            patron_tier: patronTier,
            patron_status: memberData?.attributes.patron_status,
            patreon_id: userData.id,
            patreon_full_name: userData.attributes.full_name,
            patreon_email: userData.attributes.email,
            patreon_image_url: userData.attributes.image_url,
            patron_since: memberData?.attributes.patron_status === 'active_patron' ? new Date().toISOString() : null,
          })
          .eq('id', userId);

        if (updateError) {
          console.error("[PatreonAuthFunction] Error updating profile:", updateError);
          return new Response(null, {
            status: 302,
            headers: {
              ...corsHeaders,
              "Location": `${FRONTEND_URL}/?patreonError=update_failed`,
            },
          });
        }

        // Redirect back to the frontend with a success message
        return new Response(null, {
          status: 302,
          headers: {
            ...corsHeaders,
            "Location": `${FRONTEND_URL}/?patreonConnected=true`,
          },
        });
      } catch (apiError) {
        console.error("[PatreonAuthFunction] Patreon API error:", apiError);
        return new Response(null, {
          status: 302,
          headers: {
            ...corsHeaders,
            "Location": `${FRONTEND_URL}/?patreonError=api_error`,
          },
        });
      }
    }
    
    // Endpoint to initiate OAuth flow
    else if (path === "connect") {
      // Verify authorization
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ 
            code: 401, 
            message: "Missing or invalid authorization header"
          }),
          {
            status: 401,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }
      
      const { userId } = await req.json();
      
      if (!userId) {
        return new Response(
          JSON.stringify({ error: "User ID is required" }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      console.log("[PatreonAuthFunction] Initiating Patreon OAuth flow for user:", userId);
      // Generate the OAuth URL with the fixed redirect URI
      const oauthUrl = `https://www.patreon.com/oauth2/authorize?response_type=code&client_id=${PATREON_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${userId}&scope=identity%20identity.memberships`;

      return new Response(
        JSON.stringify({ url: oauthUrl }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }
    
    // Webhook endpoint for Patreon events
    else if (path === "webhook") {
      // Verify authorization
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ 
            code: 401, 
            message: "Missing or invalid authorization header"
          }),
          {
            status: 401,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }
      
      const webhookData = await req.json() as WebhookEvent;
      
      // Verify the webhook signature (in a production environment)
      // TODO: Implement webhook signature verification using PATREON_WEBHOOK_SECRET
      // Example (conceptual - requires crypto library like `npm:node-forge` or Deno std/crypto):
      /*
      const receivedSig = req.headers.get("X-Patreon-Signature");
      const requestBody = JSON.stringify(webhookData); // Needs the RAW body ideally
      const computedSig = /* compute HMAC-MD5 of body using PATREON_WEBHOOK_SECRET */;
      /*
      if (receivedSig !== computedSig) {
        console.error("[PatreonAuthFunction] Invalid webhook signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401, headers: corsHeaders });
      }
      */
      
      const eventType = webhookData.data.type;
      const patronId = webhookData.data.id;
      
      console.log("[PatreonAuthFunction] Received Patreon webhook event:", eventType, "for patron:", patronId);
      
      // Handle different event types
      if (eventType === "member:create" || eventType === "member:update") {
        const patronStatus = webhookData.data.attributes.patron_status;
        const isActivePatron = patronStatus === "active_patron";
        
        // Find the user with this Patreon ID
        const { data: profiles, error: queryError } = await supabaseClient
          .from('profiles')
          .select('id')
          .eq('patreon_id', patronId);
          
        if (queryError || !profiles.length) {
          return new Response(
            JSON.stringify({ error: "User not found", details: queryError }),
            {
              status: 404,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        }
        
        // Update the user's patron status
        const { error: updateError } = await supabaseClient
          .from('profiles')
          .update({
            is_patron: isActivePatron,
            patron_status: patronStatus,
            // Update other fields as needed
          })
          .eq('patreon_id', patronId);
          
        if (updateError) {
          return new Response(
            JSON.stringify({ error: "Failed to update user profile", details: updateError }),
            {
              status: 500,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        }
        
        return new Response(
          JSON.stringify({ success: true }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }
      
      return new Response(
        JSON.stringify({ success: true, message: "Event received but not processed" }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Default response for the root endpoint
    return new Response(
      JSON.stringify({ 
        message: "Patreon OAuth API. Available endpoints: /connect, /callback, /webhook",
        version: "2.0",
        redirectUri: REDIRECT_URI,
        frontendUrl: FRONTEND_URL
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("[PatreonAuthFunction] Unhandled error:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});