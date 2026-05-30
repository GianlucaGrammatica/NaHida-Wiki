# Laravel: PlantsController
`app/Http/Controllers/PlantsController.php`

Gestisce tutte le operazioni sulle piante: visualizzazione, creazione, aggiornamento, annaffiatura manuale, storico e lettura più recente. La maggior parte degli endpoint restituisce JSON per essere chiamati via AJAX dal frontend, a eccezione di `index`, `show`, `create` e `store` che gestiscono pagine Blade.

---
## `index()` e `show()`

```php
public function index(Request $request): View
{
    $user   = $request->user();
    $plants = Plant::where('user_id', $user->user_id)
        ->with(['sensorReadings' => fn($q) => $q->latest('recorded_at')->limit(1)])
        ->orderBy('plant_name')
        ->get();

    return renderPage('plants.index', [
        'title'  => 'Le mie piante',
        'user'   => $user,
        'plants' => $plants,
    ]);
}

public function show(Request $request, int $id): View
{
    $plant = Plant::where('user_id', $request->user()->user_id)
        ->with(['sensorReadings' => fn($q) => $q->latest('recorded_at')->limit(50)])
        ->findOrFail($id);

    return renderPage('plants.show', [
        'title' => 'La mia pianta',
        'user'  => $request->user(),
        'plant' => $plant,
    ]);
}
```

Entrambi usano eager loading con una closure che limita le letture caricate: `index` prende solo l'ultima lettura per ogni pianta (per i badge di stato nella lista), `show` prende le ultime 50 (per alimentare i grafici Chart.js). Senza il `limit`, Eloquent caricherebbe tutta la tabella `sensor_readings` per ogni pianta.

La verifica di ownership `Plant::where('user_id', ...)` è presente in ogni query prima del `findOrFail`: se un utente tenta di accedere a una pianta che non è sua, ottiene un 404 invece di un 403, evitando di rivelare l'esistenza di quella risorsa.

`renderPage()` è un helper globale definito in `routes/functions.php` che unifica il passaggio dei dati alle view, serializza i parametri nel meta tag `params` per il JavaScript e aggiunge la versione dell'app. Vedi [[Laravel: Infrastruttura Frontend]].

---
## `create()` e `store()`

```php
public function create(): View
{
    return renderPage('plants.create', [
        'title' => 'Aggiungi pianta',
    ]);
}

public function store(StorePlantRequest $request): RedirectResponse
{
    $plant = Plant::create([
        ...$request->validated(),
        'user_id' => $request->user()->user_id,
    ]);

    return redirect()->route('plants.show', $plant->plant_id)
        ->with('success', "'{$plant->plant_name}' aggiunta con successo!");
}
```

`store()` usa `StorePlantRequest` per la validazione: le regole stanno nella Form Request invece che nel controller, tenendo il metodo pulito. Lo spread `...$request->validated()` unisce i campi validati con `user_id` prima di passarli a `create()`. `user_id` viene aggiunto qui e non esposto nel form, così non può essere falsificato dal client.
### StorePlantRequest

```php
public function rules(): array
{
    return [
        'plant_name'    => ['required', 'string', 'max:100'],
        'notes'         => ['nullable', 'string', 'max:500'],
        'hum_min'       => ['required', 'numeric', 'min:0', 'max:100'],
        'hum_max'       => ['required', 'numeric', 'min:0', 'max:100', 'gte:hum_min'],
        'temp_min'      => ['required', 'numeric', 'min:-10', 'max:60'],
        'temp_max'      => ['required', 'numeric', 'min:-10', 'max:60', 'gte:temp_min'],
        'soil_hum_min'  => ['required', 'numeric', 'min:0', 'max:100'],
        'soil_hum_max'  => ['required', 'numeric', 'min:0', 'max:100', 'gte:soil_hum_min'],
        'watering_cycle'=> ['required', 'integer', 'min:1'],
        'plant_variant' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:7'],
        'plant_color'   => ['nullable', 'string', 'max:20'],
        'flower_color'  => ['nullable', 'string', 'max:20'],
        'pot_color'     => ['nullable', 'string', 'max:20'],
    ];
}
```

La regola `gte:hum_min` su `hum_max` è una cross-field validation: Laravel confronta il valore di `hum_max` con quello di `hum_min` nello stesso request, garantendo che il massimo sia sempre maggiore o uguale al minimo senza scrivere logica custom.

I campi dell'aspetto usano `sometimes` o `nullable`: non sono obbligatori alla creazione, vengono generati casualmente dal frontend se assenti.

---
## `update()`

```php
public function update(Request $request, int $id): JsonResponse
{
    $plant = Plant::where('user_id', $request->user()->user_id)->findOrFail($id);

    $validated = $request->validate([
        'plant_name'     => ['sometimes', 'string', 'max:100'],
        'notes'          => ['sometimes', 'nullable', 'string', 'max:500'],
        'hum_min'        => ['sometimes', 'numeric', 'min:0', 'max:100'],
        'hum_max'        => ['sometimes', 'numeric', 'min:0', 'max:100', 'gte:hum_min'],
        'temp_min'       => ['sometimes', 'numeric', 'min:-10', 'max:60'],
        'temp_max'       => ['sometimes', 'numeric', 'min:-10', 'max:60', 'gte:temp_min'],
        'soil_hum_min'   => ['sometimes', 'numeric', 'min:0', 'max:100'],
        'soil_hum_max'   => ['sometimes', 'numeric', 'min:0', 'max:100', 'gte:soil_hum_min'],
        'watering_cycle' => ['sometimes', 'integer', 'min:1'],
        'plant_variant'  => ['sometimes', 'nullable', 'integer', 'min:0', 'max:7'],
        'plant_color'    => ['sometimes', 'nullable', 'integer', 'min:0', 'max:5'],
        'flower_color'   => ['sometimes', 'nullable', 'integer', 'min:0', 'max:6'],
        'pot_color'      => ['sometimes', 'nullable', 'integer', 'min:0', 'max:2'],
    ]);

    $plant->update($validated);

    return response()->json(['status' => 'ok', 'plant' => $plant->fresh()]);
}
```

Questo endpoint gestisce aggiornamenti parziali tramite PATCH: la regola `sometimes` significa che il campo viene validato solo se è presente nel request. In questo modo il frontend può inviare solo i campi modificati (es. solo `notes`, o solo i campi aspetto) senza dover mandare l'intera pianta ogni volta.

`$plant->fresh()` ricarica il record dal database dopo l'update e lo include nella risposta: il frontend usa questi dati per aggiornare `window.PLANT_DATA` in memoria senza ricaricare la pagina.

Questo endpoint viene chiamato da tre modali diversi nella pagina dettaglio pianta: il modal delle condizioni ottimali, il modal delle note, e il modal dell'aspetto. Mandano payload diversi ma usano tutti lo stesso endpoint PATCH.

---
## `water()`

```php
public function water(Request $request, int $id): JsonResponse
{
    $plant = Plant::where('user_id', $request->user()->user_id)->findOrFail($id);

    WateringEvent::create([
        'plant_id' => $plant->plant_id,
        'source'   => 'manual_app',
    ]);

    return response()->json(['status' => 'ok', 'watered_at' => now()->toDateTimeString()]);
}
```

Crea un `WateringEvent` con `source: 'manual_app'` per distinguerlo dalle annaffiature registrate dal bottone fisico (`source: 'button'`). Non viene emesso nessun evento Reverb perché l'aggiornamento del timer e l'animazione Live2D vengono gestiti direttamente dal frontend sul callback della chiamata AJAX, senza passare per il WebSocket.

`watered_at` non viene passato a `create()`: il model ha un hook `booted()` che lo imposta a `now()`.

---
## `history()`

```php
public function history(Request $request, int $id): JsonResponse
{
    $plant = Plant::where('user_id', $request->user()->user_id)->findOrFail($id);

    $waterings = $plant->wateringEvents()
        ->latest('watered_at')
        ->take(30)
        ->get()
        ->map(fn($ev) => [
            'type'       => 'watering',
            'label'      => match($ev->source) {
                'button'     => 'Annaffiatura (bottone ESP)',
                'manual_app' => 'Annaffiatura manuale',
                'scheduled'  => 'Annaffiatura automatica',
                default      => 'Annaffiatura',
            },
            'detail'     => null,
            'date'       => $ev->watered_at,
            'date_str'   => $ev->watered_at->locale('it')->isoFormat('D MMM HH:mm'),
            'date_human' => $ev->watered_at->locale('it')->diffForHumans(),
        ]);

    $warnings = $plant->sensorReadings()
        ->latest('recorded_at')
        ->take(60)
        ->get()
        ->filter(function ($r) use ($plant) {
            return ($r->temperature !== null && ($r->temperature < $plant->temp_min || $r->temperature > $plant->temp_max))
                || ($r->humidity !== null && ($r->humidity < $plant->hum_min || $r->humidity > $plant->hum_max))
                || ($r->soil_humidity !== null && ($r->soil_humidity < $plant->soil_hum_min || $r->soil_humidity > $plant->soil_hum_max));
        })
        ->map(function ($r) use ($plant) {
            $issues = [];
            if ($r->temperature !== null) {
                if ($r->temperature > $plant->temp_max)      $issues[] = 'Temperatura alta: ' . round($r->temperature, 1) . '°C';
                elseif ($r->temperature < $plant->temp_min)  $issues[] = 'Temperatura bassa: ' . round($r->temperature, 1) . '°C';
            }
            if ($r->humidity !== null) {
                if ($r->humidity > $plant->hum_max)          $issues[] = 'Umidità alta: ' . round($r->humidity) . '%';
                elseif ($r->humidity < $plant->hum_min)      $issues[] = 'Umidità bassa: ' . round($r->humidity) . '%';
            }
            if ($r->soil_humidity !== null) {
                if ($r->soil_humidity > $plant->soil_hum_max)    $issues[] = 'Suolo umido: ' . round($r->soil_humidity) . '%';
                elseif ($r->soil_humidity < $plant->soil_hum_min) $issues[] = 'Suolo secco: ' . round($r->soil_humidity) . '%';
            }
            return [
                'type'       => 'warning',
                'label'      => count($issues) === 1 ? $issues[0] : 'Parametri fuori range',
                'detail'     => count($issues) > 1 ? implode(', ', $issues) : null,
                'date'       => $r->recorded_at,
                'date_str'   => $r->recorded_at->locale('it')->isoFormat('D MMM HH:mm'),
                'date_human' => $r->recorded_at->locale('it')->diffForHumans(),
            ];
        });

    $events = $waterings->concat($warnings)
        ->sortByDesc('date')
        ->take(30)
        ->values()
        ->map(fn($ev) => collect($ev)->except('date')->all());

    return response()->json(['events' => $events]);
}
```

`history()` è la funzione più complessa del controller. Costruisce una timeline mista fondendo due sorgenti di dati eterogenee: annaffiature e letture anomale.

Le due collection vengono costruite separatamente con `take(30)` e `take(60)` per limitare il volume di dati caricati dal database. I warning vengono filtrati in PHP dopo il caricamento invece che in SQL: una query con `WHERE` sulle colonne di range richiederebbe un join con la tabella `plants` e renderebbe la query molto più complessa. Con 60 letture è comunque veloce.

Dopo il merge con `concat()`, la collection viene riordinata per data (`sortByDesc('date')`), troncata a 30 eventi totali e poi il campo `date` viene rimosso dalla risposta finale con `collect($ev)->except('date')`. Il campo `date` serve solo come chiave di ordinamento ed è un oggetto Carbon che non si serializza bene in JSON, quindi viene tolto prima di restituire la risposta.

Il campo `detail` è `null` quando c'è un solo problema, e contiene la lista di tutti i problemi separati da virgola quando ce ne sono più di uno. Il frontend mostra `detail` come riga aggiuntiva sotto il `label` principale.

---
## `latestReading()`

```php
public function latestReading(Request $request, int $id): JsonResponse
{
    $plant = Plant::where('user_id', $request->user()->user_id)->findOrFail($id);

    $reading = $plant->sensorReadings()
        ->latest('recorded_at')
        ->first();

    if (!$reading) {
        return response()->json(['reading' => null]);
    }

    return response()->json([
        'reading' => [
            'temperature'   => $reading->temperature,
            'humidity'      => $reading->humidity,
            'soil_humidity' => $reading->soil_humidity,
            'luminosity'    => $reading->luminosity,
            'recorded_at'   => $reading->recorded_at->toDateTimeString(),
        ]
    ]);
}
```

Endpoint di fallback per il polling AJAX: viene chiamato dal frontend ogni 15 secondi se la connessione WebSocket non ha ricevuto aggiornamenti recenti. Restituisce solo la lettura più recente, non l'intera collection.

> Nota: in `routes/web.php` questa route è definita fuori dal gruppo middleware `auth`. Il metodo internamente chiama `$request->user()->user_id`, quindi una chiamata non autenticata genererebbe un errore 500 invece di un 401. In un sistema produttivo andrebbe spostata dentro il gruppo `auth`.