/**
 * Environment variable validation utilities
 * 
 * This helps ensure that required environment variables are present
 * and properly formatted before using them in the application.
 */

// Define environment variables with their validation rules
interface EnvVar {
  name: string;
  required: boolean;
  validator?: (value: string) => boolean;
  fallback?: string;
}

// Environment variables needed by the application
const envVars: EnvVar[] = [
  {
    name: 'VITE_SUPABASE_URL',
    required: true,
    validator: (value) => value.startsWith('https://') && value.includes('.supabase.co'),
  },
  {
    name: 'VITE_SUPABASE_ANON_KEY',
    required: true,
    validator: (value) => value.startsWith('eyJ') && value.length > 20,
  },
  {
    name: 'VITE_REDDIT_CLIENT_ID',
    required: true,
  },
  {
    name: 'VITE_OPENROUTER_API_KEY',
    required: false,
  }
];

// Validate a single environment variable
function validateEnvVar(envVar: EnvVar): { valid: boolean; value: string | null; error?: string } {
  const value = import.meta.env[envVar.name] as string;
  
  // Check if required variable is missing
  if (envVar.required && (!value || value.trim() === '')) {
    return {
      valid: false,
      value: null,
      error: `Missing required environment variable: ${envVar.name}`
    };
  }
  
  // Use fallback for non-required missing variables
  if ((!value || value.trim() === '') && envVar.fallback !== undefined) {
    return {
      valid: true,
      value: envVar.fallback
    };
  }
  
  // Run validator if provided
  if (value && envVar.validator && !envVar.validator(value)) {
    return {
      valid: false,
      value,
      error: `Invalid format for environment variable: ${envVar.name}`
    };
  }
  
  return {
    valid: true,
    value: value || null
  };
}

// Validate all environment variables
export function validateEnv(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  let valid = true;
  
  envVars.forEach(envVar => {
    const result = validateEnvVar(envVar);
    if (!result.valid) {
      valid = false;
      if (result.error) {
        errors.push(result.error);
        console.error(result.error);
      }
    }
  });
  
  return { valid, errors };
}

// Get a validated environment variable
export function getEnvVar(name: string): string | null {
  const envVar = envVars.find(ev => ev.name === name);
  if (!envVar) {
    console.warn(`Requested undefined environment variable: ${name}`);
    return null;
  }
  
  const result = validateEnvVar(envVar);
  return result.valid ? result.value : null;
}

// Initialize environment validation on app startup
export function initializeEnvValidation(): void {
  const { valid, errors } = validateEnv();
  
  if (!valid) {
    console.error('Environment validation failed:');
    errors.forEach(error => console.error(`- ${error}`));
    
    // In development, show a more visible error
    if (import.meta.env.DEV) {
      document.body.innerHTML = `
        <div style="padding: 20px; font-family: sans-serif; color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px;">
          <h3>Environment Configuration Error</h3>
          <p>The application cannot start due to missing or invalid environment variables:</p>
          <ul>
            ${errors.map(error => `<li>${error}</li>`).join('')}
          </ul>
          <p>Please check your .env file and ensure all required variables are set correctly.</p>
        </div>
      `;
    }
  }
}