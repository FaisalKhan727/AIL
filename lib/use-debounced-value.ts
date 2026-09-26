"use client";
import * as React from "react";

/** Delays updates to `value` until it's stayed still for `delayMs`. Used to
 *  avoid firing a network request on every keystroke in search inputs. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
