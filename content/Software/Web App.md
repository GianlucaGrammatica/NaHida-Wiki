![[NaHida_Picture_3.jpg]]
## Stack tecnologico
Il backend è costruito su **Laravel 12**, un framework PHP che segue il pattern MVC e fornisce out of the box un sistema di routing, ORM, autenticazione, validazione e gestione degli eventi. Il server web usato in sviluppo è **Laravel Herd** con PHP 8.3.

Il frontend usa **Blade** come motore di templating, **Tailwind CSS v4** per gli stili e **DaisyUI** come libreria di componenti. Il tema grafico è completamente personalizzato con due varianti, chiara e scura, definite tramite le API di theming di DaisyUI con CSS custom properties. Il font usato è **Balsamiq Sans**. Per le interazioni client-side viene usato **Alpine.js** e JavaScript vanilla con fetch per le chiamate AJAX. I grafici sono renderizzati con **Chart.js**.

Il build tool è **Vite**, integrato nel progetto tramite il plugin ufficiale di Laravel.

Per la comunicazione in tempo reale tra server e browser viene usato **Laravel Reverb**, un server WebSocket first-party di Laravel, con **Laravel Echo** lato client. Questo permette di aggiornare i valori dei sensori nella pagina senza ricaricarla.

La comunicazione con i dispositivi fisici avviene tramite **MQTT** su TLS, usando il broker cloud **HiveMQ Cloud**. Lato Laravel viene usata la libreria `php-mqtt/laravel-client`.

---
## Struttura del backend

Il backend segue la struttura standard di Laravel. Le route sono divise in tre file: `web.php` per le pagine, `auth.php` per le rotte di autenticazione e `api.php` per gli endpoint usati internamente dal frontend JavaScript.

I controller principali sono:
- `DashboardController`: aggrega i dati per la dashboard: piante fuori range, prossime annaffiature, attività recenti
- `PlantsController`: gestisce la lista, il dettaglio, la creazione e la modifica delle piante, lo storico e le ultime letture
- `DeviceController`:  gestisce il collegamento e lo scollegamento dei dispositivi e pubblica comandi MQTT verso l'ESP (configurazione, musica, LED)
- `ProfileController` e `SettingsController`: gestione del profilo utente e delle impostazioni
Vedi i dettagli dei controller in [[Laravel plants controller]]

Una funzione helper globale `renderPage()` definita in `routes/functions.php` uniforma il passaggio dei dati alle view Blade, serializzando i parametri anche in un meta tag `params` accessibile lato JavaScript.

---
## MQTT e aggiornamenti in tempo reale

Il comando Artisan `mqtt:listen` (classe `MqttListener`) gira come processo separato in ascolto su due topic wildcard:

- `device/+/updates`: riceve le letture dei sensori (JSON con `type: sensor_data`) e i messaggi del bottone fisico (`BUTTON_PRESSED` come stringa plain)
- `device/+/status`: riceve il ping `ONLINE` del dispositivo e aggiorna il campo `last_seen_at`

Quando arriva una lettura valida, il listener salva un record in `sensor_readings` e poi emette un evento Laravel `SensorUpdated`. Quando arriva `BUTTON_PRESSED`, crea un record in `watering_events` con `source: button` e emette `ButtonPressed`. Entrambi gli eventi implementano `ShouldBroadcast` e vengono trasmessi via Reverb sul canale `plant.{plant_id}`.

Il frontend si iscrive al canale tramite Echo e aggiorna i valori dei sensori, il badge di stato salute e lo stato del modello Live2D senza ricaricare la pagina. Come fallback, è attivo anche un polling AJAX ogni 15 secondi che chiama `/plants/{id}/latest-reading`, usato nei casi in cui la connessione WebSocket non sia disponibile.

Un bridge JavaScript (`bridge.js`) legge i dati iniziali serializzati nel meta tag `params` e le variabili d'ambiente con prefisso `VITE_` dal meta tag `env`, rendendoli disponibili come oggetti frozen (`fromServer`, `ENV`) per tutti gli script della pagina.

---
## Struttura del frontend

Ogni pagina ha un file JavaScript dedicato in `resources/js/pages/`. La pagina dei dettagli pianta (`plants_show.js`) è la più complessa: gestisce l'annaffiatura manuale, lo storico via AJAX, il collegamento del dispositivo, la modifica delle condizioni ottimali, le note, la modifica dell'aspetto, la connessione Echo/WebSocket, il polling di fallback e i grafici Chart.js.

I grafici mostrano le ultime 50 letture per quattro metriche (temperatura, umidità aria, umidità suolo, luminosità) con linee tratteggiate che indicano i range ottimali configurati per quella pianta. I dati vengono aggiornati live all'arrivo di ogni nuova lettura via WebSocket senza ricostruire il grafico da zero.

Le finestre modali sono componenti Blade condivisi inclusi nel layout base. Le operazioni all'interno dei modali (salvataggio condizioni, note, aspetto) usano tutte chiamate AJAX con feedback toast, senza redirect.

_Vedi [[Laravel pipeline realtime frontend]] e [[Laravel infrastruttura frontend]]

---
### Temi

Il tema grafico è definito come plugin DaisyUI con due varianti: `NaHida_Light` e `NaHida_Dark`. Entrambe usano una palette ispirata ai toni naturali: verdi, marroni caldi e beige. La selezione del tema viene salvata in `localStorage` e applicata all'attributo `data-theme` dell'elemento `html` al caricamento della pagina.