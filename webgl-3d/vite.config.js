import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { Buffer } from 'node:buffer'

/**
 * Kleiner Entwicklungs-Endpunkt, um Menü-Icons direkt aus dem Browser
 * in `public/icons/` zu speichern (POST /__save-icon mit {name, dataUrl}).
 * Nur im Dev-Server aktiv.
 */
function iconUploadPlugin() {
  return {
    name: 'icon-upload',
    configureServer(server) {
      server.middlewares.use('/__save-icon', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Headers', 'content-type')
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
        if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
        if (req.method !== 'POST') { res.statusCode = 405; return res.end('POST only') }
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', () => {
          try {
            const { name, dataUrl, dir: sub } = JSON.parse(body)
            if (!/^[a-z0-9_]+$/i.test(name || '')) throw new Error('ungültiger Name')
            const folder = sub === 'levels' ? 'public/levels' : 'public/icons'
            const b64 = String(dataUrl).split(',')[1]
            const dir = path.resolve(process.cwd(), folder)
            fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(b64, 'base64'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: true, file: name + '.png' }))
          } catch (e) {
            res.statusCode = 400
            res.end(JSON.stringify({ ok: false, error: String(e.message || e) }))
          }
        })
      })
    },
  }
}

/**
 * Build-Stempel (JJJJMMTTHHMMSS, deutsche Zeit): steht im Spiel (Anmeldeseite, Konto-Leiste)
 * und als `dist/version.txt` – so sieht man nach einem Deploy, welche Fassung online ist.
 */
const BUILD = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).replace(/\D/g, '')

function buildStampPlugin() {
  return {
    name: 'build-stamp',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.txt', source: BUILD + '\n' })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Unterordner statt eigener Adresse? Dann VITE_BASE=/ordner/ beim Build setzen.
  base: process.env.VITE_BASE || '/',
  plugins: [react(), iconUploadPlugin(), buildStampPlugin()],
  define: {
    __BUILD__: JSON.stringify(command === 'build' ? BUILD : 'dev'),
  },
  server: {
    port: 5180,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
}))
