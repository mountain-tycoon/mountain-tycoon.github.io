import { useEffect, useRef } from 'react';

export function useGameLoop(callback, isActive = true) {
    const requestRef = useRef();
    const previousTimeRef = useRef();
    const callbackRef = useRef(callback);

    // Keep callback ref up to date
    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    useEffect(() => {
        const animate = time => {
            if (previousTimeRef.current !== undefined) {
                const deltaTime = time - previousTimeRef.current;
                callbackRef.current(deltaTime);
            }
            previousTimeRef.current = time;
            requestRef.current = requestAnimationFrame(animate);
        };

        if (isActive) {
            requestRef.current = requestAnimationFrame(animate);
        } else {
            // CRITICAL FIX: Only cancel if requestRef exists
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        }
        return () => {
            // CRITICAL FIX: Only cancel if requestRef exists
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
        // Note: callback is intentionally NOT in deps to prevent restarting animation loop on every render
    }, [isActive]);
}
