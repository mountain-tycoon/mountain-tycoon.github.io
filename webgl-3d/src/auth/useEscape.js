import { useEffect } from 'react';

/** Schließt einen Dialog mit der Escape-Taste. */
export function useEscape(onClose) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
}
