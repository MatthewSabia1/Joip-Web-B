/**
 * Parses user input to extract subreddit names, handling various formats
 * 
 * @param input User input string containing subreddit names
 * @returns Array of cleaned subreddit names
 */
export function parseSubreddits(input: string): string[] {
  if (!input.trim()) return [];

  // First, split by common separators: commas, semicolons, newlines
  const splits = input.split(/[,;\n]+/);
  
  // Process each potential subreddit name
  return splits
    .map(item => {
      // Clean up the item and remove any r/ prefix, trailing/leading slashes
      let cleaned = item.trim();
      
      // Remove r/ or /r/ prefix if present
      cleaned = cleaned.replace(/^(\/)?r\//, '');
      
      // Remove any remaining slashes
      cleaned = cleaned.replace(/\//g, '');
      
      // Remove any special characters that aren't valid in subreddit names
      cleaned = cleaned.replace(/[^\w_]/g, '');
      
      return cleaned;
    })
    .filter(name => name.length > 0); // Filter out empty names
}