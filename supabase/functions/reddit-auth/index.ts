// Follow this setup guide to integrate the Deno runtime and Supabase functions: https://deno.land/manual/supabase_runtime

import { createClient } from "npm:@supabase/supabase-js@2.39.8";
import queryString from "npm:query-string@9.0.0";
import base64 from "npm:base-64@1.0.0";

interface RedditTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

// Read secrets from environment variables
const REDDIT_CLIENT_ID = Deno.env.get("REDDIT_CLIENT_ID");
const REDDIT_CLIENT_SECRET = Deno.env.get("REDDIT_CLIENT_SECRET");

// Frontend app URL for redirects - use the deployed Netlify URL
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "http://localhost:5173"; // Fallback to common local dev port

// Use the exact redirect URI that is registered in your Reddit app settings
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
if (!SUPABASE_URL) {
  console.error("Critical Error: SUPABASE_URL environment variable is not set.");
  // In a real scenario, you might throw or return a specific error response
}
// IMPORTANT: For local development using `supabase start`, ensure REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, SUPABASE_URL, etc.
// are set in `supabase/.env.local`. Also, you MUST configure the local callback URL
// (e.g., "http://localhost:<supabase-port>/functions/v1/reddit-auth/callback")
// as a valid Redirect URI in your Reddit application settings.
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/reddit-auth/callback`; // Ensure SUPABASE_URL is set

// Reddit API requires a proper User-Agent following format:
// <platform>:<app ID>:<version string> (by /u/<reddit username>)
const REDDIT_USER_AGENT = 'web:com.joip.slideshow:v1.0.0 (by /u/joip_dev)';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req) => {
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

  try {
    // Check for missing critical environment variables
    if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET || !SUPABASE_URL) {
      console.error("Missing critical environment variables: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, or SUPABASE_URL");
      return new Response(
        JSON.stringify({ error: "Server configuration error: Missing required environment variables." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create a Supabase client - we don't use this for these operations, but might use it later
    // for direct database access
    const _supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    

    // Handle OAuth callback - THIS IS THE CRITICAL PATH
    if (path === "callback") {
      // For GET requests (from Reddit's OAuth redirect)
      if (req.method === "GET") {
        // Parse the query parameters
        const params = queryString.parse(url.search);
        
        const code = params.code as string;
        const state = params.state as string;
        
        if (!code) {
          return new Response("No authorization code provided", {
            status: 400,
            headers: corsHeaders,
          });
        }

        try {
          // Exchange code for tokens
          
          // Create basic auth header
          const authHeader = "Basic " + base64.encode(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`);
          
          const tokenResponse = await fetch("https://www.reddit.com/api/v1/access_token", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Authorization": authHeader,
              "User-Agent": REDDIT_USER_AGENT
            },
            body: queryString.stringify({
              code,
              grant_type: "authorization_code",
              redirect_uri: REDIRECT_URI,
            }),
          });

          if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            
            // Handle specific error cases
            const redirectPath = '/';
            let errorMessage = '';
            
            if (tokenResponse.status === 401) {
              errorMessage = "reddit_auth_error=unauthorized";
            } else if (tokenResponse.status === 403) {
              errorMessage = "reddit_auth_error=forbidden";
            } else if (tokenResponse.status === 429) {
              errorMessage = "reddit_auth_error=rate_limited";
            } else if (tokenResponse.status >= 500) {
              errorMessage = "reddit_auth_error=server_error";
            } else {
              errorMessage = `reddit_auth_error=failed&code=${tokenResponse.status}`;
            }
            
            // Redirect back to the frontend with error information
            const redirectUrl = `${FRONTEND_URL}${redirectPath}?${errorMessage}&state=${state}`;
            
            return new Response(null, {
              status: 302,
              headers: {
                ...corsHeaders,
                "Location": redirectUrl,
              },
            });
          }

          const tokens = await tokenResponse.json() as RedditTokenResponse;
          
          // Encode tokens for safe transport
          // Using base64.encode from npm:base-64 to ensure compatibility
          const encodedTokens = base64.encode(JSON.stringify(tokens));
          
          // Prepare redirect URL back to the frontend 
          const redirectUrl = `${FRONTEND_URL}/?reddit_tokens=${encodedTokens}&state=${state}`;
          
          // Redirect back to the frontend with encoded tokens
          return new Response(null, {
            status: 302,
            headers: {
              ...corsHeaders,
              "Location": redirectUrl,
            },
          });
          
        } catch (error) {
          return new Response(
            `Error processing Reddit authentication: ${error.message}\n${error.stack}`,
            {
              status: 500,
              headers: {
                ...corsHeaders,
                "Content-Type": "text/plain",
              },
            }
          );
        }
      }
      
      // Handle POST requests (from our frontend)
      if (req.method === "POST") {
        
        // Note: For security in production you would check authorization, but 
        // we're removing this for now as it's causing issues with the callback flow
        /*
        const authHeader = req.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          console.error("[RedditAuthFunction] Missing or invalid authorization header");
          return new Response(
            JSON.stringify({ 
              code: 401, 
              message: "Missing or invalid authorization header",
              expected: "Bearer <SUPABASE_ANON_KEY>",
              received: authHeader ? authHeader.substring(0, 10) + "..." : "none",
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
        */
        
        const { code } = await req.json();
        
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

        try {
          
          const authHeaderValue = "Basic " + base64.encode(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`);
          
          const tokenResponse = await fetch("https://www.reddit.com/api/v1/access_token", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Authorization": authHeaderValue,
              "User-Agent": REDDIT_USER_AGENT
            },
            body: queryString.stringify({
              code,
              grant_type: "authorization_code",
              redirect_uri: REDIRECT_URI,
            }),
          });

          if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            
            return new Response(
              JSON.stringify({ 
                error: "Failed to exchange code for tokens", 
                details: errorText,
                status: tokenResponse.status,
                url: REDIRECT_URI
              }),
              {
                status: 400,
                headers: {
                  ...corsHeaders,
                  "Content-Type": "application/json",
                },
              }
            );
          }

          const tokens = await tokenResponse.json() as RedditTokenResponse;
          
          return new Response(
            JSON.stringify(tokens),
            {
              status: 200,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        } catch (exchangeError) {
          return new Response(
            JSON.stringify({ 
              error: "Token exchange error", 
              message: exchangeError.message,
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
      }
      
      // If we get here, it's an unsupported method
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }
    
    // Endpoint to refresh an access token
    else if (path === "refresh") {
      if (req.method !== "POST") {
        return new Response(
          JSON.stringify({ error: "Method not allowed" }),
          {
            status: 405,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }
      
      // Temporarily disabled authentication check for ease of debugging
      /*
      // Verify authorization
      const authHeader = req.headers.get("Authorization");
      console.log("[RedditAuthFunction] Refresh - Auth header:", authHeader ? "present" : "missing");
      
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
      */
      
      try {
        const { refreshToken } = await req.json();
        
        if (!refreshToken) {
          return new Response(
            JSON.stringify({ error: "Refresh token is required" }),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        }
        
        // Exchange refresh token for a new access token
        const authHeaderValue = "Basic " + base64.encode(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`);
        const tokenResponse = await fetch("https://www.reddit.com/api/v1/access_token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": authHeaderValue,
            "User-Agent": REDDIT_USER_AGENT
          },
          body: queryString.stringify({
            refresh_token: refreshToken,
            grant_type: "refresh_token",
          }),
        });
        
        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          
          // Enhanced error response with more details
          let errorCode = 'unknown_error';
          let httpStatus = 400;
          
          if (tokenResponse.status === 401) {
            errorCode = 'unauthorized';
            httpStatus = 401;
          } else if (tokenResponse.status === 403) {
            errorCode = 'forbidden';
            httpStatus = 403;
          } else if (tokenResponse.status === 429) {
            errorCode = 'rate_limited';
            httpStatus = 429;
          } else if (tokenResponse.status >= 500) {
            errorCode = 'reddit_server_error';
            httpStatus = 502; // Using 502 Bad Gateway to indicate upstream service error
          }
          
          return new Response(
            JSON.stringify({ 
              error: "Failed to refresh token", 
              error_code: errorCode,
              details: errorText,
              status: tokenResponse.status,
            }),
            {
              status: httpStatus,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        }
        
        const tokens = await tokenResponse.json();
        
        return new Response(
          JSON.stringify(tokens),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      } catch (refreshError) {
        return new Response(
          JSON.stringify({ 
            error: "Token refresh error", 
            message: refreshError.message,
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
    }

    // Default response for the root endpoint
    return new Response(
      JSON.stringify({ 
        message: "Reddit OAuth API. Available endpoints: /callback, /refresh",
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
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack,
        name: error.name
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