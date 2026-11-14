# Anmeldeserver (Cloudflare Worker + KV, kostenlos)

Gleiches Prinzip wie bei Interventional Lab: Spieler registrieren sich mit Name, E-Mail und eigenem
Passwort, der Admin schaltet sie frei, danach melden sie sich an. Der Kampagnen-Fortschritt und die
Spielstände (das gebaute Skigebiet je Level) hängen am Konto und wandern so von Gerät zu Gerät.
Gespeichert werden nur Passwort-Hashes (PBKDF2).

## Einmalig einrichten (etwa fünf Minuten, kostenloses Cloudflare-Konto)

```bash
cd webgl-3d/worker
npx wrangler login                       # öffnet den Browser, „Allow" klicken
npx wrangler kv namespace create KV      # die ausgegebene id in wrangler.toml eintragen
npx wrangler deploy                      # gibt die Adresse aus: https://mountain-tycoon-auth.<konto>.workers.dev
npx wrangler secret put ADMIN_EMAILS     # Admin-Adresse(n), durch Komma getrennt
npx wrangler secret put ADMIN_PASSWORD   # Admin-Passwort (mindestens 8 Zeichen)
```

Die Adresse des Workers steht in `webgl-3d/.env.production` (`VITE_AUTH_ENDPOINT=…`). Ist sie leer,
läuft das Spiel ohne Anmeldung – so ist es beim Entwickeln mit `npm run dev`.

## Aktualisieren (nach Änderungen an `worker.js`)

`cd webgl-3d/worker && npx wrangler deploy` – KV und Secrets bleiben erhalten. Die Seite fragt
`/version` ab (`SERVER_V` in `worker.js`). Was sie davon braucht, steht in `src/auth/authClient.js`:
unter `SERVER_MIN` zeigt der Anmeldebildschirm einen Hinweis, unter `SERVER_SAVES` bleiben die
Spielstände auf dem Gerät und gehen erst nach dem Aktualisieren des Workers zusätzlich ans Konto.

## Verwaltung

Der Admin meldet sich auf der normalen Anmeldeseite mit seiner Adresse aus `ADMIN_EMAILS` und dem
`ADMIN_PASSWORD` an. Im Hauptmenü erscheint dann unten links „Verwaltung":

- **Konten** – wartende Registrierungen freischalten oder ablehnen, Konten sperren oder entfernen.
- **Passwort vergessen** – „Passwort zurücksetzen" erzeugt einen Einmalcode. Damit meldet sich der
  Spieler an und legt sofort ein neues Passwort fest.
- **Anmeldungen** – wer sich wann angemeldet hat.

Sofortige Freischaltung ohne Admin: `AUTO_APPROVE = "1"` in `wrangler.toml`, dann `npx wrangler deploy`.

## Admin-Passwort vergessen

Das Passwort ist ein Secret des Workers und steht nirgends im Klartext. Neu setzen:
`cd webgl-3d/worker && npx wrangler secret put ADMIN_PASSWORD`.

## Lokal testen

```bash
cd webgl-3d/worker
cp .dev.vars.example .dev.vars           # eigene Testwerte eintragen
npx wrangler dev --port 8787             # Anmeldeserver lokal, KV wird simuliert
# zweites Terminal:
cd webgl-3d
VITE_AUTH_ENDPOINT=http://localhost:8787 npm run dev
```

## Erlaubte Seiten

`ALLOWED_ORIGINS` in `wrangler.toml` listet die Adressen, die den Server benutzen dürfen
(die Spielseite und der lokale Entwicklungsserver). Zieht das Spiel um, dort die neue Adresse
eintragen und neu deployen.
