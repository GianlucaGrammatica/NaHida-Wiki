# Laravel: Infrastruttura Frontend
Questa pagina documenta i moduli di configurazione che fanno da base per tutto il JavaScript dell'applicazione: il passaggio dei dati dal server al browser, la connessione WebSocket, il sistema dei temi e il sound manager.

---
## `renderPage()` e il meta tag `params`
`routes/functions.php`

```php
function renderPage($page = "index", $parametri = [
    'title' => 'NaHida'
]) : View {
    return view($page, [
        'version' => env('VERSION', '1.0.0'),
        'title'   => $parametri["title"] ?? config("app.name", "NaHida"),
        'name'    => config("app.name", "NaHida"),
        'params'  => $parametri
    ]);
}
```

`renderPage()` è un helper globale definito fuori da qualsiasi classe. Tutti i controller lo usano invece di chiamare `view()` direttamente. Oltre a passare i dati alla view Blade, garantisce che `$params` sia sempre disponibile nel layout per la serializzazione nel meta tag.

Nel layout `app.blade.php` i dati vengono scritti in due meta tag:

```html
<meta name="params" content="{{ json_encode($params ?? ['null' => 0]) }}">
<meta name="env" content="{{ json_encode(
    collect($_ENV)->concat(getenv())
        ->filter(fn($value, $key) => str_starts_with($key, 'VITE_'))
        ->all()
) }}">
```

Il meta tag `params` contiene tutti i dati passati dal controller serializzati in JSON. Il meta tag `env` contiene le variabili d'ambiente con prefisso `VITE_`, filtrate per non esporre variabili sensibili come `DB_PASSWORD`.
### `bridge.js`
`resources/js/config/bridge.js`

```javascript
export const fetchData = () => {
    try {
        const data = document.querySelector("meta[name='params']");
        const temp = JSON.parse(data.getAttribute("content") || "{}");
        data.remove();
        return temp;
    } catch(e) {
        console.error(e);
    }
};

export const fetchEnv = () => {
    try {
        const data = document.querySelector("meta[name='env']");
        const temp = {
            ...import.meta.env,
            ...JSON.parse(data.getAttribute("content") || "{}")
        };
        data.remove();
        return temp;
    } catch(e) {
        console.error(e);
    }
};

export let fromServer = fetchData();
export let ENV = fetchEnv();

fromServer = Object.freeze(fromServer);
ENV = Object.freeze(ENV);
```

`bridge.js` viene importato da `bootstrap.js` e quindi eseguito su ogni pagina prima di qualsiasi altro script. Legge i due meta tag, li fa il parse, poi li rimuove dal DOM con `.remove()`. La rimozione evita che il contenuto dei meta tag (che include dati dell'utente) rimanga accessibile a script di terze parti o estensioni del browser dopo il caricamento.

`Object.freeze()` rende le due variabili immutabili: nessun altro script può sovrascrivere `fromServer` o `ENV` dopo l'inizializzazione.

Gli oggetti vengono importati dagli script di pagina come:

```javascript
import { fromServer, ENV } from '../config/bridge.js';
```

Nella pagina `plants/show.blade.php` i dati critici (configurazione pianta, letture, aspetto Live2D) vengono iniettati direttamente come variabili `window.*` tramite un tag `<script>` inline nel Blade invece di passare per `params`. Questo perché `plants_show.js` li legge prima che `bridge.js` sia eseguito. Vedi [[Laravel: Pipeline Real-time Frontend]].

---
## `echo.js`
`resources/js/config/echo.js`

```javascript
import { ENV } from "./bridge.js";
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

window.Pusher = Pusher;

window.Echo = new Echo({
    broadcaster: 'reverb',
    key:         ENV.VITE_REVERB_APP_KEY,
    wsHost:      ENV.VITE_REVERB_HOST,
    wsPort:      ENV.VITE_REVERB_PORT ?? 80,
    wssPort:     ENV.VITE_REVERB_PORT ?? 443,
    forceTLS:    (ENV.VITE_REVERB_SCHEME ?? 'https') === 'https',
    enabledTransports: ['ws', 'wss'],
});
```

Echo usa `pusher-js` come trasporto WebSocket anche con Reverb: Reverb implementa il protocollo Pusher, quindi il client è lo stesso. `window.Pusher` deve essere globale perché `laravel-echo` lo cerca su `window` internamente.

La configurazione viene letta da `ENV` (le variabili `VITE_`) invece di essere hardcoded: in sviluppo punta al server Reverb locale, in produzione punta all'istanza su Render. `forceTLS` viene determinato dallo scheme configurato, così la stessa build funziona in entrambi gli ambienti.

---
## `app.js` e inizializzazione globale
`resources/js/app.js`

```javascript
import './bootstrap';
import './config/theme.js';
import { initSoundUI } from './config/sound-ui.js';

import Alpine from 'alpinejs';

window.Alpine = Alpine;
Alpine.start();

window.addEventListener("pageshow", () => {
    const theme = localStorage.getItem('Nahida_theme');
    try { setTheme(theme) } catch {}
    document.getElementById('theme_controller').checked = theme === "dark";
});

document.addEventListener('DOMContentLoaded', initSoundUI);
```

`bootstrap.js` importa `bridge.js` ed `echo.js`, quindi vengono eseguiti per primi su ogni pagina. `Alpine.start()` inizializza Alpine.js globalmente. Il tema viene applicato sull'evento `pageshow` invece di `DOMContentLoaded` per coprire anche il caso della navigazione back/forward del browser, che non ri-esegue il JavaScript ma mostra la pagina dalla cache.

---
## Sistema dei temi
`resources/js/config/theme.js`

```javascript
function setTheme(theme) {
    if(typeof theme === "boolean") theme = theme ? 'dark' : 'light';

    const controller = document.querySelector('input.theme-controller');
    const btnLight   = document.getElementById('btn_theme_light');
    const btnDark    = document.getElementById('btn_theme_dark');

    if (theme === 'light') {
        try {
            btnLight.classList.add(...activeClasses);
            btnLight.classList.remove(...inactiveClasses);
            // ... aggiorna stato visivo bottoni ...
            if (controller) {
                controller.checked = false;
                controller.dispatchEvent(new Event('change'));
            }
        } catch {}
        localStorage.setItem('Nahida_theme', 'light');
    } else {
        // ... speculare per dark ...
        localStorage.setItem('Nahida_theme', 'dark');
    }
}

window.setTheme = setTheme;
```

Il tema viene applicato tramite il `theme-controller` di DaisyUI: un `<input type="checkbox">` il cui `value` corrisponde al nome del tema (`NaHida_Dark`). Quando viene spuntato, DaisyUI aggiorna automaticamente l'attributo `data-theme` sull'elemento `html`. `setTheme` orchestra anche lo stato visivo dei due bottoni nella pagina Impostazioni.

`setTheme` è esposta su `window` per poter essere chiamata dagli handler `onclick` inline nei Blade senza importarla.

I due temi sono definiti come plugin DaisyUI in `resources/css/app.css` con una palette ispirata ai toni naturali. La definizione completa con tutte le CSS custom properties sta nel file CSS e non viene ripetuta qui.

---
## Sound Manager
`resources/js/config/sound.js`

```javascript
const BASE = '/audios/';

const SOUNDS = {
    tap0:       'SFX_UI_Tap_0.mp3',
    tap1:       'SFX_UI_Tap_1.mp3',
    positive:   'SFX_UI_FEEDBACK_Positive.mp3',
    negative:   'SFX_UI_FEEDBACK_Negative.mp3',
    plantHappy: 'SFX_Plant_Happy.mp3',
    plantMid:   'SFX_Plant_Mid.mp3',
    plantSad:   'SFX_Plant_Sad.mp3',
};

class SoundManager {
    constructor() {
        this._muted  = localStorage.getItem('Nahida_muted') === 'true';
        this._pool   = {};
        this._tapIdx = 0;
    }

    _get(name) {
        if (!this._pool[name]) {
            const a   = new Audio(BASE + SOUNDS[name]);
            a.volume  = VOLUMES[name] ?? 0.5;
            a.preload = 'auto';
            this._pool[name] = a;
        }
        return this._pool[name];
    }

    play(name) {
        if (this._muted || !SOUNDS[name]) return;
        try {
            const a = this._get(name);
            a.currentTime = 0;
            a.play().catch(() => {});
        } catch {}
    }

    tap() {
        this.play(this._tapIdx++ % 2 === 0 ? 'tap0' : 'tap1');
    }

    toggle() {
        this.setMuted(!this._muted);
        return this._muted;
    }
}

export const Sound = new SoundManager();
window.Sound = Sound;
```

`_get()` implementa un pool lazy: gli oggetti `Audio` vengono creati solo al primo utilizzo e poi riutilizzati. Crearli tutti al caricamento della pagina rallenterebbe l'avvio e potrebbe essere bloccato dalle policy autoplay del browser prima di qualsiasi interazione utente.

`a.currentTime = 0` prima di `play()` permette di riavviare un suono anche se è già in riproduzione, utile per click rapidi.

`a.play().catch(() => {})` silenzia l'errore che i browser lanciano quando `play()` viene chiamato senza una precedente interazione utente (autoplay policy). Il suono semplicemente non parte, senza bloccare l'esecuzione.

`tap()` alterna tra `tap0` e `tap1` ad ogni chiamata per varietà sonora.
### `sound-ui.js`
`resources/js/config/sound-ui.js`

```javascript
export function initSoundUI() {

    document.addEventListener('click', (e) => {
        if (e.target.closest('#btn_toggle_sound')) return;

        if (e.target.closest('.docke')) {
            Sound.tap(); return;
        }
        if (e.target.closest('.btn, a, button')) {
            Sound.tap(); return;
        }
        if (e.target.closest('[onclick*="showModal"]')) {
            Sound.tap();
        }
    }, true);

    const toastContainer = document.getElementById('toast-container');
    if (toastContainer) {
        new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (!(node instanceof HTMLElement)) continue;
                    const cl = node.classList;
                    if      (cl.contains('alert-success'))  { Sound.play('positive'); return; }
                    else if (cl.contains('alert-error'))    { Sound.play('negative'); return; }
                    else if (cl.contains('alert-warning'))  { Sound.play('negative'); return; }
                    else if (cl.contains('alert-info'))     { Sound.play('negative'); return; }
                }
            }
        }).observe(toastContainer, { childList: true });
    }

    const canvas = document.getElementById('live2d-canvas');
    if (canvas) {
        canvas.addEventListener('pointerdown', () => {
            const label = document.querySelector('[data-health-label]')?.textContent ?? '';
            if      (label.includes('ottimali'))  Sound.play('plantHappy');
            else if (label.includes('ttenzione')) Sound.play('plantMid');
            else if (label.includes('pessime'))   Sound.play('plantSad');
            else                                   Sound.play('plantHappy');
        });
    }
}
```

Il listener click usa la **capture phase** (`true` come terzo argomento di `addEventListener`): intercetta i click prima che arrivino ai target, coprendo anche elementi aggiunti dinamicamente al DOM dopo il caricamento. È event delegation applicata ai suoni.

Il `MutationObserver` sul toast container è una soluzione disaccoppiata: i suoni dei feedback non richiedono modifiche ai punti del codice che creano i toast. Ogni volta che un nodo viene aggiunto al container, l'observer legge la classe CSS e sceglie il suono appropriato.

Il suono del tap sul canvas Live2D legge il testo del badge salute (`[data-health-label]`) per scegliere il suono emotivo corretto in base allo stato attuale della pianta.