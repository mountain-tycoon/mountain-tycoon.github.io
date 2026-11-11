import React, { useState, useEffect, useRef } from 'react';
import { gridToScreen, screenToGrid, TILE_WIDTH, TILE_HEIGHT } from '../engine/isometric';

const GRID_SIZE = 20;

const Viewport = ({ onTileClick }) => {
    const [offset, setOffset] = useState({ x: window.innerWidth / 2, y: 100 });
    const [scale, setScale] = useState(1);
    const isDragging = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });

    const handleMouseDown = (e) => {
        isDragging.current = true;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e) => {
        if (!isDragging.current) return;
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
        isDragging.current = false;
    };

    const handleWheel = (e) => {
        const zoomSpeed = 0.001;
        setScale(prev => Math.max(0.2, Math.min(2, prev - e.deltaY * zoomSpeed)));
    };

    const handleContextMenu = (e) => e.preventDefault();

    // Helper to render grid
    const renderGrid = () => {
        const tiles = [];
        for (let x = 0; x < GRID_SIZE; x++) {
            for (let y = 0; y < GRID_SIZE; y++) {
                const screenPos = gridToScreen(x, y);
                tiles.push(
                    <path
                        key={`${x}-${y}`}
                        d={`M ${screenPos.x} ${screenPos.y} 
               L ${screenPos.x + TILE_WIDTH / 2} ${screenPos.y + TILE_HEIGHT / 2} 
               L ${screenPos.x} ${screenPos.y + TILE_HEIGHT} 
               L ${screenPos.x - TILE_WIDTH / 2} ${screenPos.y + TILE_HEIGHT / 2} Z`}
                        fill="#2d5a27"
                        stroke="#1e3e1a"
                        strokeWidth="1"
                        className="tile"
                        onClick={(e) => {
                            e.stopPropagation();
                            onTileClick(x, y);
                        }}
                    />
                );
            }
        }
        return tiles;
    };

    return (
        <div
            className="viewport-container"
            style={{
                width: '100vw',
                height: '100vh',
                overflow: 'hidden',
                background: '#1a1a1a',
                cursor: isDragging.current ? 'grabbing' : 'grab'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onContextMenu={handleContextMenu}
        >
            <svg
                width="100%"
                height="100%"
                style={{ pointerEvents: 'none' }}
            >
                <g transform={`translate(${offset.x}, ${offset.y}) scale(${scale})`} style={{ pointerEvents: 'all' }}>
                    {renderGrid()}
                </g>
            </svg>
        </div>
    );
};

export default Viewport;
