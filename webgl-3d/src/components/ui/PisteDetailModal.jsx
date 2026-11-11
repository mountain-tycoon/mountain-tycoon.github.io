import React from 'react';
import './PisteDetailModal.css';

const PisteDetailModal = ({ piste, baseAltitude = 0, onClose }) => {
    if (!piste) return null;

    // Höhenlage: unterster/oberster Punkt der Piste in echter Meereshöhe
    let minZ = Infinity, maxZ = -Infinity;
    for (const seg of piste.segments || []) {
        if (seg.z !== undefined) {
            if (seg.z < minZ) minZ = seg.z;
            if (seg.z > maxZ) maxZ = seg.z;
        }
    }
    const hasAltitude = maxZ > -Infinity;
    const altLow = Math.round(baseAltitude + minZ);
    const altHigh = Math.round(baseAltitude + maxZ);

    // Condition styling
    let conditionText = "Sehr gut";
    let conditionColor = "#22c55e"; // Green-500

    if (piste.condition < 0.2) {
        conditionText = "Sehr schlecht";
        conditionColor = "#ef4444"; // Red-500
    } else if (piste.condition < 0.4) {
        conditionText = "Schlecht";
        conditionColor = "#f97316"; // Orange-500
    } else if (piste.condition < 0.6) {
        conditionText = "Mittelmäßig";
        conditionColor = "#eab308"; // Yellow-500
    } else if (piste.condition < 0.8) {
        conditionText = "Gut";
        conditionColor = "#84cc16"; // Lime-500
    }

    const isSnowLow = piste.snowDepth < 20;

    return (
        <div className="piste-modal-overlay" onClick={onClose}>
            <div className="piste-modal-content" onClick={e => e.stopPropagation()}>
                <div className="piste-modal-header">
                    <h2>Piste #{piste.number}</h2>
                    <button className="piste-modal-close" onClick={onClose}>&times;</button>
                </div>

                <div className="piste-modal-body">
                    <div className="piste-stat-row">
                        <span className="stat-label">Länge:</span>
                        <span className="stat-value">{piste.length} m</span>
                    </div>

                    {hasAltitude && (
                        <div className="piste-stat-row">
                            <span className="stat-label">Höhenlage:</span>
                            <span className="stat-value">{altLow.toLocaleString()} – {altHigh.toLocaleString()} m ü. M.</span>
                        </div>
                    )}

                    <div className="piste-stat-row">
                        <span className="stat-label">Durchschn. Gefälle:</span>
                        <span className="stat-value">
                            {isNaN(piste.avgGradient) ? 0 : Math.round(piste.avgGradient)}% ({piste.avgDifficulty || 'N/A'})
                        </span>
                    </div>

                    <div className="piste-stat-section">
                        <div className="piste-stat-row">
                            <span className="stat-label">Zustand:</span>
                            <span className="stat-value" style={{ color: conditionColor, fontWeight: 'bold' }}>
                                {conditionText} ({Math.round(piste.condition * 100)}%)
                            </span>
                        </div>
                        <div className="condition-bar-container">
                            <div
                                className="condition-bar-fill"
                                style={{
                                    width: `${piste.condition * 100}%`,
                                    backgroundColor: conditionColor
                                }}
                            />
                        </div>
                    </div>

                    <div className="piste-stat-section">
                        <div className="piste-stat-row">
                            <span className="stat-label">Schneehöhe:</span>
                            <span className="stat-value" style={{ color: isSnowLow ? '#ef4444' : 'inherit', fontWeight: isSnowLow ? 'bold' : 'normal' }}>
                                {isNaN(piste.snowDepth) ? 0 : piste.snowDepth} cm
                            </span>
                        </div>
                        {isSnowLow && (
                            <div className="snow-warning">
                                ⚠️ Schneehöhe kritisch! (&lt; 20cm)<br />
                                <small>Zusätzliche Schneekanonen benötigt.</small>
                            </div>
                        )}
                    </div>
                </div>

                <div className="piste-modal-footer">
                    <button className="piste-modal-ok" onClick={onClose}>Schließen</button>
                </div>
            </div>
        </div>
    );
};

export default PisteDetailModal;
