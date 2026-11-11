import { useState, useEffect } from 'react';

export const useSpriteLoader = () => {
    const [sprites, setSprites] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadSprites = async () => {
            const loadedSprites = {};
            const buildingIds = ['sauna']; // Add more IDs as needed
            const rotations = [0, 90, 180, 270];

            const promises = buildingIds.flatMap(id =>
                rotations.map(rot => {
                    return new Promise((resolve) => {
                        const img = new Image();
                        const src = `${import.meta.env.BASE_URL || '/'}sprites/${id}_${rot}.png`;
                        img.src = src;
                        img.onload = () => {
                            if (!loadedSprites[id]) loadedSprites[id] = {};
                            loadedSprites[id][rot] = img;
                            resolve();
                        };
                        img.onerror = () => {
                            // Silently fail if sprite missing, fallback will handle it
                            resolve();
                        };
                    });
                })
            );

            await Promise.all(promises);
            setSprites(loadedSprites);
            setLoading(false);
        };

        loadSprites();
    }, []);

    return { sprites, loading };
};
