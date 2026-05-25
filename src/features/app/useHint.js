import { useState, useCallback, useEffect } from "react";
import { save, load } from "./storage";

export function useHint(hintKey) {
  const fullKey = `pawtimer_hint_${hintKey}`;
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check localStorage on mount
    const hasSeen = load(fullKey, false);
    setIsVisible(!hasSeen);
  }, [fullKey]);

  const dismiss = useCallback(() => {
    save(fullKey, true);
    setIsVisible(false);
  }, [fullKey]);

  return { isVisible, dismiss };
}
