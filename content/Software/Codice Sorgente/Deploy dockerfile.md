# Deploy: Dockerfile e Hosting
Il progetto viene deployato su **Render** (web app) e **Supabase** (database MySQL). Il container è definito da un Dockerfile multi-stage che produce un'immagine con frontend già compilato e tutti e tre i processi Laravel avviati insieme.

---
## Dockerfile

```dockerfile
# STAGE 1: Frontend
FROM node:20-slim AS node_builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# STAGE 2: PHP
FROM php:8.4-cli-bullseye

RUN apt-get update && apt-get install -y \
    libpng-dev libonig-dev libxml2-dev libpq-dev zip unzip git curl \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN docker-php-ext-install pdo_mysql pdo_pgsql mbstring exif pcntl bcmath gd

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs
RUN npm install -g concurrently

WORKDIR /var/www/html
COPY . .
COPY --from=node_builder /app/public/build ./public/build

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer
RUN composer install --no-dev --optimize-autoloader

RUN chown -R www-data:www-data /var/www/html/storage \
    /var/www/html/bootstrap/cache \
    && chmod -R 775 /var/www/html/storage

EXPOSE 10000

CMD php artisan migrate && \
    php artisan storage:link && \
    php artisan config:cache && \
    php artisan route:cache && \
    concurrently \
    "php artisan serve --host=0.0.0.0 --port=10000" \
    "php artisan reverb:start --host=0.0.0.0 --port=8080" \
    "php artisan mqtt:listen"
```
### Stage 1: build del frontend
Il primo stage usa `node:20-slim` per compilare gli asset Vite. La copia di `package*.json` prima del resto del codice sfrutta il layer caching di Docker: se i file delle dipendenze non cambiano, `npm install` non viene rieseguito nelle build successive, risparmiando diversi minuti.

`npm run build` produce i file in `public/build/` con hash nel nome per il cache busting. Questo stage viene scartato alla fine, rimane solo l'output compilato.
### Stage 2: immagine PHP finale

Si usa `php:8.4-cli-bullseye` invece di una variante con Apache o Nginx: Laravel viene servito da `php artisan serve` che è un server di sviluppo integrato, sufficiente per il tier gratuito di Render. Evita la complessità di configurare un virtual host Apache/Nginx.

`pdo_pgsql` viene installato insieme a `pdo_mysql` perché Supabase espone il database sia via MySQL che via PostgreSQL. `bcmath` e `pcntl` sono richiesti da alcune funzionalità di Laravel. `gd` serve per la manipolazione delle immagini (salvataggio del preview Live2D).

```dockerfile
COPY --from=node_builder /app/public/build ./public/build
```

Questa riga è il punto di giunzione tra i due stage: copia solo la directory `public/build` dall'immagine del builder, senza portarsi dietro `node_modules` (che pesa centinaia di MB).

```dockerfile
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer
```

Composer viene copiato dall'immagine ufficiale invece di installarlo manualmente, così è sempre aggiornato.

`composer install --no-dev --optimize-autoloader` esclude le dipendenze di sviluppo e genera il classmap ottimizzato per la produzione.
### Permessi storage
```dockerfile
RUN chown -R www-data:www-data /var/www/html/storage \
    /var/www/html/bootstrap/cache \
    && chmod -R 775 /var/www/html/storage
```

Laravel scrive log, cache delle view e session nella directory `storage`. Senza questi permessi il container parte ma crasha alla prima richiesta che tenta una scrittura.
### Avvio con `concurrently`

```dockerfile
CMD php artisan migrate && \
    php artisan storage:link && \
    php artisan config:cache && \
    php artisan route:cache && \
    concurrently \
    "php artisan serve --host=0.0.0.0 --port=10000" \
    "php artisan reverb:start --host=0.0.0.0 --port=8080" \
    "php artisan mqtt:listen"
```

Il `CMD` esegue le migrazioni e i comandi di ottimizzazione prima di avviare i processi. Questo garantisce che il database sia allineato allo schema attuale ad ogni deploy senza un passo manuale.

`concurrently` è un pacchetto npm che gestisce più processi in parallelo in un singolo terminale. Senza di esso si dovrebbe scegliere tra un solo processo o scrivere uno script shell con gestione dei PID. I tre processi sono:

| Processo                   | Porta   | Funzione                                    |
| -------------------------- | ------- | ------------------------------------------- |
| `php artisan serve`        | 10000   | Server HTTP Laravel (richieste web e API)   |
| `php artisan reverb:start` | 8080    | Server WebSocket per il broadcast real-time |
| `php artisan mqtt:listen`  | nessuna | Consumer MQTT long-running                  |

La porta 10000 è quella che Render si aspetta per il tier gratuito. Render espone solo questa porta all'esterno e il traffico WebSocket viene instradato dallo stesso hostname tramite reverse proxy interno.

---
## Hosting su Render
Render rileva il `Dockerfile` automaticamente e costruisce l'immagine ad ogni push sul branch `main`. Le variabili d'ambiente (credenziali database, MQTT, chiavi Reverb, `APP_KEY`) vengono configurate nel pannello Render e iniettate nel container a runtime, non nel Dockerfile.

Il tier gratuito di Render mette il servizio in sleep dopo 15 minuti di inattività: la prima richiesta dopo il dormiveglia ha una latenza di avvio di circa 30-60 secondi. Questo comportamento è accettabile per un progetto scolastico ma richiederebbe un piano a pagamento per un uso continuativo.

Il database MySQL è ospitato su **Supabase** nel tier gratuito, che offre 500MB di storage e connessioni persistenti senza sleep automatico.