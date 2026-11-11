export const LEVELS = {
    NORWAY: {
        name: "Norwegen",
        description: "Steile Fjorde und hohe, verschneite Gipfel.",
        seed: 8841,
        params: {
            peakCount: 4,
            peakHeight: 550, // Higher than default 400
            valleyWidth: 0.12, // Very narrow valleys
            snowLine: 80, // Snow starts very low (it's north!)
            treeLine: 250, // Trees stop earlier
            rockThreshold: 400, // Rocks at high altitude
            riverWidth: 4.0, // Wider fjord-like river
            noiseScale: 0.18 // Rougher terrain
        }
    },
    ALPS: {
        name: "Alpen",
        description: "Klassisches Skigebiet.",
        seed: 123,
        params: {
            peakCount: 3,
            peakHeight: 400,
            valleyWidth: 0.15,
            snowLine: 120,
            treeLine: 300,
            rockThreshold: 350,
            riverWidth: 3.0,
            noiseScale: 0.15
        }
    }
};
