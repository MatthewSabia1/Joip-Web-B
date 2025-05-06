import { useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";

type Theme = "dark" | "light" | "system";

export function useTheme() {
  // Changed default theme from "system" to "dark"
  const [theme, setTheme] = useLocalStorage<Theme>("theme", "dark");

  useEffect(() => {
    const root = window.document.documentElement;
    
    // Remove old theme class
    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  return { theme, setTheme };
}