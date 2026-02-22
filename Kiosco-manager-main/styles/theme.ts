/**
 * 24 SIETE - Sistema de Diseño Cyberpunk/Neon
 * Paleta basada en el logo físico
 */

export const theme = {
  colors: {
    // Colores principales del logo
    neonCyan: '#00f3ff',
    neonMagenta: '#ff00ff',
    darkBg: '#050505',

    // Tonos complementarios
    deepDark: '#0a0a0a',
    carbonGray: '#1a1a1a',
    slateGray: '#2a2a2a',

    // Acentos para estados
    cyanGlow: 'rgba(0, 243, 255, 0.15)',
    magentaGlow: 'rgba(255, 0, 255, 0.15)',
    cyanBright: '#4dffff',
    magentaBright: '#ff4dff',

    // Texto
    textPrimary: '#f0f0f0',
    textSecondary: '#a0a0a0',
    textMuted: '#606060',

    // Estados
    success: '#00ff88',
    warning: '#ffaa00',
    error: '#ff0055',
  },

  shadows: {
    neonCyan: '0 0 10px rgba(0, 243, 255, 0.5), 0 0 20px rgba(0, 243, 255, 0.3)',
    neonCyanStrong: '0 0 15px rgba(0, 243, 255, 0.7), 0 0 30px rgba(0, 243, 255, 0.5)',
    neonMagenta: '0 0 10px rgba(255, 0, 255, 0.5), 0 0 20px rgba(255, 0, 255, 0.3)',
    neonMagentaStrong: '0 0 15px rgba(255, 0, 255, 0.7), 0 0 30px rgba(255, 0, 255, 0.5)',
    card: '0 4px 20px rgba(0, 0, 0, 0.5)',
    cardHover: '0 8px 30px rgba(0, 243, 255, 0.2)',
  },

  borders: {
    neonCyan: `2px solid #00f3ff`,
    neonMagenta: `2px solid #ff00ff`,
    doubleCyan: `4px double #00f3ff`,
    doubleMagenta: `4px double #ff00ff`,
    subtle: `1px solid #2a2a2a`,
  },

  animations: {
    pulse: 'neon-pulse 2s ease-in-out infinite',
    glow: 'neon-glow 1.5s ease-in-out infinite alternate',
    slideIn: 'slide-in 0.3s ease-out',
  },
} as const;

export type Theme = typeof theme;