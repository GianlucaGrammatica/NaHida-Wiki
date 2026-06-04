# Laravel: Pipeline Real-time Frontend
`resources/js/pages/plants_show.js`

Questa pagina documenta il file JavaScript più complesso del progetto: gestisce i dati in tempo reale, i grafici, le chiamate AJAX dei modali, la comunicazione con il modello Live2D e il fallback di polling. Il file è organizzato in funzioni `init*` indipendenti, tutte chiamate dal `DOMContentLoaded` finale.

Per i moduli di base (Echo, bridge, sound) vedi [[Laravel infrastruttura frontend]]. Per come il backend emette gli eventi ricevuti qui vedi [[Laravel ESP verso server]].

---
## Dati iniziali iniettati dal Blade

In `plants/show.blade.php`, prima di qualsiasi script, un tag `<script>` inline inietta i dati del server come variabili `window.*`:

```javascript
window.PLANT_ID = {{ $plant->plant_id }};

window.PLANT_APPEARANCE = {
    pot_color:     {{ (int)($plant->pot_color     ?? 0) }},
    plant_variant: {{ (int)($plant->plant_variant ?? 0) }},
    plant_color:   {{ (int)($plant->plant_color   ?? 0) }},
    flower_color:  {{ (int)($plant->flower_color  ?? 0) }},
};

window.PLANT_DATA = {
    plant_name:     {!! json_encode($plant->plant_name) !!},
    temp_min:       {{ $plant->temp_min }},
    // ... tutti i range ottimali ...
    device_token:   {!! json_encode($device?->device_token) !!},
    has_device:     {{ $device ? 'true' : 'false' }},
};

window.PLANT_HEALTH = {
    temperature:   {{ $latest?->temperature   ?? 'null' }},
    humidity:      {{ $latest?->humidity       ?? 'null' }},
    soil_humidity: {{ $latest?->soil_humidity  ?? 'null' }},
    luminosity:    {{ $latest?->luminosity     ?? 'null' }},
};

window.PLANT_READINGS = {!! json_encode(
    $plant->sensorReadings->reverse()->values()->map(...)
) !!};
```

`PLANT_DATA` viene usato come stato mutabile lato client: quando l'utente salva condizioni o aspetto aggiornati, `Object.assign(PLANT_DATA, payload)` aggiorna i valori in memoria senza ricaricare la pagina. `PLANT_READINGS` alimenta i grafici Chart.js con le ultime 50 letture già disponibili al caricamento, così i grafici sono subito popolati.

---
## `calcHealth()`

```javascript
function calcHealth(reading) {
    if (!reading) return {
        state: 'normal', errorCount: 0,
        healthColor: 'success',
        healthLabel: 'Condizioni ottimali',
        healthEmoji: 'NaHida_Emoji_Happy.png'
    };

    const pd = PLANT_DATA;
    let errorCount = 0;

    if (reading.temperature !== null && reading.temperature !== undefined) {
        if (reading.temperature < pd.temp_min || reading.temperature > pd.temp_max) errorCount++;
    }
    if (reading.humidity !== null && reading.humidity !== undefined) {
        if (reading.humidity < pd.hum_min || reading.humidity > pd.hum_max) errorCount++;
    }
    if (reading.soil_humidity !== null && reading.soil_humidity !== undefined) {
        if (reading.soil_humidity < pd.soil_hum_min || reading.soil_humidity > pd.soil_hum_max) errorCount++;
    }

    let state = 'normal';
    if (reading.luminosity !== null && reading.luminosity !== undefined && reading.luminosity < 50) {
        state = 'sleep';
    } else if (errorCount >= 2) {
        state = 'sad';
    } else if (errorCount === 1) {
        state = 'mid';
    }

    const healthColor = errorCount === 0 ? 'success' : errorCount === 1 ? 'warning' : 'error';
    const healthLabel = errorCount === 0 ? 'Condizioni ottimali' : errorCount === 1 ? 'Attenzione richiesta' : 'Condizioni pessime';
    const healthEmoji = errorCount === 0 ? 'NaHida_Emoji_Happy.png' : errorCount === 1 ? 'NaHida_Emoji_Mid.png' : 'NaHida_Emoji_Sad.png';

    return { state, errorCount, healthColor, healthLabel, healthEmoji };
}
```

`calcHealth()` è la funzione centrale che collega i dati IoT allo stato visivo dell'interfaccia. Prende una lettura e confronta ogni sensore con i range in `PLANT_DATA`, contando quanti parametri sono fuori range.

La luminosità ha un trattamento speciale: se è sotto 50 lux la pianta entra in modalità `sleep` indipendentemente dagli altri parametri. La logica è che buio significa notte, non uno stato di salute critico.

Lo `state` ritornato viene passato a `PlantViewer.setState()` che cambia espressione e animazione del modello Live2D. Il `healthColor`, `healthLabel` e `healthEmoji` aggiornano il badge visivo sotto il canvas. Vedi [[Live2d plant viewer]].

---
## `initEcho()` e `initSensorPolling()` - Real-time e fallback

```javascript
function initEcho() {
    if (!window.Echo || !PLANT_ID) return;

    Echo.channel(`plant.${PLANT_ID}`)
        .listen('.SensorUpdated', (e) => {
            window.PLANT_HEALTH = { ...e };
            updateSensorDisplay(e);
            const health = calcHealth(e);
            updateHealthBadge(health);
            PlantViewer?.setState(health.state);
            window._lastEchoUpdate = Date.now();
        })
        .listen('.ButtonPressed', (e) => {
            showToast(e.message ?? '💧 Annaffiatura rilevata!', 'success');
            PlantViewer?.playWatering();
            updateNextWateringDisplay(new Date().toISOString());
        });
}

function initSensorPolling() {
    if (!PLANT_DATA.has_device || !PLANT_DATA.device_token) return;

    async function pollReading() {
        if (window._lastEchoUpdate && (Date.now() - window._lastEchoUpdate) < 20_000) {
            return;
        }
        try {
            const data = await apiRequest(`/plants/${PLANT_ID}/latest-reading`);
            if (data?.reading) {
                const r = data.reading;
                const newTime = new Date(r.recorded_at).getTime();
                if (!window._lastReadingTime || newTime > window._lastReadingTime) {
                    window._lastReadingTime = newTime;
                    window.PLANT_HEALTH = { ...r };
                    updateSensorDisplay(r);
                    const health = calcHealth(r);
                    updateHealthBadge(health);
                    PlantViewer?.setState(health.state);
                }
            }
        } catch {}
    }

    pollReading();
    setInterval(pollReading, 15_000);
    setInterval(() => fetchDeviceStatus(...), 15_000);
}
```

Le due funzioni lavorano in parallelo ma si coordinano tramite `window._lastEchoUpdate`. Il polling salta la chiamata HTTP se Echo ha ricevuto un aggiornamento negli ultimi 20 secondi: evita richieste ridondanti quando il WebSocket funziona, ma subentra automaticamente se la connessione cade.

Il polling controlla anche `window._lastReadingTime` per non processare la stessa lettura due volte se il server restituisce lo stesso dato in chiamate ravvicinate.

Entrambi i percorsi (Echo e polling) passano per le stesse funzioni `updateSensorDisplay`, `calcHealth`, `updateHealthBadge` e `PlantViewer.setState`: il codice di aggiornamento UI è scritto una volta sola e i due trasporti sono intercambiabili.

---
## `updateSensorDisplay()`

```javascript
function updateSensorDisplay(reading) {
    const noData = document.getElementById('sensor_no_data');
    const grid   = document.getElementById('sensor_grid');
    const updEl  = document.getElementById('sensor_updated_at');

    if (noData) noData.classList.add('hidden');
    if (grid)   grid.classList.remove('hidden');
    if (updEl)  updEl.classList.remove('hidden');

    function colorClass(val, min, max) {
        return (val === null || val === undefined || (val >= min && val <= max))
            ? 'text-success'
            : 'text-error';
    }

    const tempEl = document.getElementById('val_temp');
    if (tempEl && reading.temperature !== null) {
        tempEl.textContent = `${parseFloat(reading.temperature).toFixed(1)}°C`;
        tempEl.className   = `text-2xl font-bold ${colorClass(reading.temperature, pd.temp_min, pd.temp_max)}`;
    }
    // ... stessa logica per humidity, soil_humidity, luminosity ...

    if (updEl) {
        const ts = new Date(reading.recorded_at).toLocaleTimeString('it-IT', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        updEl.textContent = `Aggiornato alle ${ts}`;
    }

    if (window._appendChartReading) {
        window._appendChartReading({ ...reading, recorded_at: reading.recorded_at ?? new Date().toISOString() });
    }

    setPageDeviceStatus(true, new Date().toISOString());
    prependReadingRow(reading);
    showToast('📊 Sensori aggiornati', 'info');
}
```

Al primo aggiornamento la funzione rivela la griglia dei sensori e nasconde il placeholder "nessun dato": la pagina mostra sempre lo stato corretto anche se il dispositivo non ha ancora inviato nessuna lettura al momento del caricamento.

`colorClass()` determina il colore del valore (`text-success` o `text-error`) confrontando il dato con i range ottimali. Se il valore è `null` o `undefined`, restituisce comunque `text-success` per non mostrare falsi allarmi su dati mancanti.

`window._appendChartReading` è una funzione esposta da `initCharts()`: se i grafici sono stati inizializzati, ricevono il nuovo punto senza ricostruire il grafico da zero. Il collegamento tramite `window.*` invece di un import diretto è intenzionale: `updateSensorDisplay` non sa se i grafici esistono, e chiamare `_appendChartReading?.()` gestisce il caso in cui non ci siano abbastanza letture per mostrarli.

---
## `initCharts()`

```javascript
function initCharts() {
    if (!window.PLANT_READINGS?.length || typeof Chart === 'undefined') return;

    const METRICS = {
        temp: { data: readings.map(r => r.temperature), label: 'Temperatura',
                unit: '°C', color: css('--color-primary'), min: pd.temp_min, max: pd.temp_max },
        hum:  { data: readings.map(r => r.humidity),    label: 'Umidità aria',
                unit: '%',  color: css('--color-info'),    min: pd.hum_min,  max: pd.hum_max },
        soil: { data: readings.map(r => r.soil_humidity), label: 'Umidità suolo',
                unit: '%',  color: css('--color-success'), min: pd.soil_hum_min, max: pd.soil_hum_max },
        lum:  { data: readings.map(r => r.luminosity ?? null), label: 'Luminosità',
                unit: ' lx', color: css('--color-warning'), min: null, max: null },
    };
```

I colori delle linee vengono letti con:

```javascript
function css(v) {
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
}
```

`getComputedStyle` legge le CSS custom properties del tema attivo al momento del rendering: se l'utente ha selezionato il tema scuro, i grafici usano la palette scura. Non è necessario ri-inizializzare i grafici al cambio tema perché la funzione viene chiamata solo una volta, ma la scelta cromatica è automaticamente coerente con il tema al caricamento.

```javascript
function buildDatasets(key) {
    const m = METRICS[key];
    const datasets = [];

    if (m.min !== null && m.max !== null) {
        datasets.push({
            label: '_max',
            data:  labels.map(() => m.max),
            borderColor: `color-mix(in srgb, ${m.color} 45%, transparent)`,
            borderWidth: 1.5,
            borderDash: [5, 4],
            pointRadius: 0,
            fill: false,
        });
        datasets.push({ /* _min, speculare */ });
    }

    datasets.push({
        label:       m.label,
        data:        m.data,
        borderColor: m.color,
        borderWidth: 2,
        tension:     0.35,
        spanGaps:    true,
    });

    return datasets;
}
```

Le linee tratteggiate del range ottimale vengono costruite come dataset separati con `label: '_min'` e `label: '_max'`. Il prefisso `_` serve come convenzione interna: il tooltip e la legenda le filtrano con `item.dataset.label?.startsWith('_')`. `color-mix(in srgb, ...)` è CSS nativo che crea una versione semitrasparente del colore della linea principale per le soglie.

`spanGaps: true` collega i punti anche se ci sono valori `null` nella serie (luminosità non disponibile per alcune letture).
### Aggiornamento live del grafico

```javascript
window._appendChartReading = function (reading) {
    const time = new Date(reading.recorded_at)
        .toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

    METRICS.temp.data.push(reading.temperature);
    METRICS.hum.data.push(reading.humidity);
    METRICS.soil.data.push(reading.soil_humidity);
    METRICS.lum.data.push(reading.luminosity ?? null);
    labels.push(time);

    if (labels.length > 50) {
        labels.shift();
        Object.values(METRICS).forEach(m => m.data.shift());
    }

    chart.data.labels   = labels;
    chart.data.datasets = buildDatasets(activeKey);
    chart.update('none');
};
```

Il nuovo punto viene aggiunto alle array in memoria di `METRICS`. Se i punti totali superano 50, il punto più vecchio viene rimosso con `shift()` da tutti gli array sincronizzati (labels e tutti e quattro i METRICS). `chart.update('none')` aggiorna il grafico disabilitando l'animazione: con aggiornamenti ogni 10 secondi l'animazione renderebbe il grafico instabile visivamente.

---
## `initAppearance()` - snapshot e ripristino

```javascript
function initAppearance() {
    let _savedAppearance = null;
    let _didSave = false;

    // apertura modale: scatta snapshot
    document.querySelectorAll('[onclick*="modal_edit_plant"]').forEach(btn => {
        btn.addEventListener('click', () => {
            // ... popola slider con valori correnti ...
            _savedAppearance = { ...appearance };
            _didSave = false;
        });
    });

    // slider: anteprima live sul modello
    ['range_variant', 'range_pot', 'range_plant_color', 'range_flower'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            PlantViewer?.setAppearance({ /* legge tutti i slider */ });
        });
    });

    // chiusura senza salvataggio: ripristina snapshot
    modal.addEventListener('close', () => {
        if (!_didSave && _savedAppearance) {
            PlantViewer?.setAppearance(_savedAppearance);
        }
        _didSave = false;
    });

    // salvataggio riuscito: aggiorna snapshot e cattura preview
    btnSave.addEventListener('click', async () => {
        // ... PATCH /plants/{id} ...
        if (data.status === 'ok') {
            _didSave = true;
            window.PLANT_APPEARANCE = { ...window.PLANT_APPEARANCE, ...appearance };
            PlantViewer?.setAppearance(appearance);
            modal.close();
            await PlantViewer?.capturePreview(PLANT_ID);
        }
    });
}
```

Il pattern snapshot garantisce che muovere gli slider (che aggiorna il modello in tempo reale come anteprima) non lasci il modello in uno stato non salvato se l'utente chiude il modale con "Annulla". Lo snapshot viene scattato all'apertura del modale, e il flag `_didSave` distingue una chiusura per salvataggio da una chiusura per annullamento.

`capturePreview()` viene chiamato dopo il salvataggio: scatta un'immagine del canvas Live2D e la invia al server che la salva come PNG. L'immagine viene poi usata come thumbnail della pianta nella lista e nella dashboard. Vedi [[Live2d plant viewer#`capturePreview()`]].

---
## Inizializzazione

```javascript
document.addEventListener('DOMContentLoaded', () => {
    initWatering();
    initHistory();
    initDevice();
    initConditions();
    initNotes();
    initMusic();
    initAppearance();
    initEcho();
    initSensorPolling();
    initCharts();

    if (window.PLANT_HEALTH) {
        const health = calcHealth(window.PLANT_HEALTH);
        updateHealthBadge(health);
        PlantViewer?.setState(health.state);
    }
});
```

L'ultimo blocco applica lo stato di salute iniziale al badge e al modello Live2D usando i dati già disponibili da `window.PLANT_HEALTH` (iniettati dal Blade con l'ultima lettura dal database). Questo garantisce che il modello mostri l'espressione corretta già al primo frame visibile, prima che arrivi qualsiasi aggiornamento in tempo reale.

`PlantViewer?.setState()` usa l'optional chaining: se il modello non è ancora caricato al momento del `DOMContentLoaded`, la chiamata viene ignorata senza errori. Il Live2D SDK chiama `setState` di nuovo una volta completato il caricamento tramite `live2d-start.js`.