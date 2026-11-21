import { useRef } from 'react';

/**
 * Returns a ref for a glass panel. The specular highlight is painted purely in
 * CSS from the document-root `--px` / `--py` custom properties, so the light
 * sweeps every panel at 60 fps with zero React re-renders.
 */
export function useSpecular<T extends HTMLElement>() {
  return useRef<T | null>(null);
}
