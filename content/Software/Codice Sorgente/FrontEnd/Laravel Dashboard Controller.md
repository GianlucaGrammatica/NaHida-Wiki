# Laravel: DashboardController

`app/Http/Controllers/DashboardController.php`

La dashboard aggrega dati da più tabelle per costruire tre sezioni: piante fuori range, prossime annaffiature e attività recente. Tutte le query vengono eseguite in `show()` e i risultati passati alla view tramite `renderPage()`.

---

## Piante fuori range (`$attentionPlants`)

```php
$attentionPlants = Plant::where('user_id', $userId)
    ->whereHas('sensorReadings', function ($query) {
        $query->whereRaw(
            'sensor_readings.recorded_at = (
                SELECT MAX(sr.recorded_at)
                FROM sensor_readings sr
                WHERE sr.plant_id = plants.plant_id
            )'
        )->where(function ($q) {
            $q->whereColumn('sensor_readings.humidity', '<', 'plants.hum_min')
              ->orWhereColumn('sensor_readings.humidity', '>', 'plants.hum_max')
              ->orWhereColumn('sensor_readings.temperature', '<', 'plants.temp_min')
              ->orWhereColumn('sensor_readings.temperature', '>', 'plants.temp_max')
              ->orWhereColumn('sensor_readings.soil_humidity', '<', 'plants.soil_hum_min')
              ->orWhereColumn('sensor_readings.soil_humidity', '>', 'plants.soil_hum_max');
        });
    })->get();
```

`whereHas('sensorReadings', ...)` genera una subquery con `EXISTS`: seleziona le piante per cui esiste almeno una lettura che soddisfa le condizioni interne. Non carica le letture in memoria, fa tutto in SQL.

La parte più complessa è la subquery correlata nel `whereRaw`:

```sql
sensor_readings.recorded_at = (
    SELECT MAX(sr.recorded_at)
    FROM sensor_readings sr
    WHERE sr.plant_id = plants.plant_id
)
```

Questa condizione filtra la `JOIN` implicita di `whereHas` per considerare **solo la lettura più recente** di ogni pianta. Senza di essa, `whereHas` restituirebbe una pianta come "fuori range" anche se l'ultima lettura è normale ma una lettura di tre giorni fa era anomala.

La subquery è **correlata**: fa riferimento a `plants.plant_id` della query esterna, quindi viene rivalutata per ogni pianta. Su dataset piccoli (decine di piante) è accettabile; su dataset grandi richiederebbe un indice su `sensor_readings(plant_id, recorded_at)`.

`whereColumn` confronta due colonne della stessa query invece di confrontare una colonna con un valore fisso: `whereColumn('sensor_readings.humidity', '<', 'plants.hum_min')` genera `sensor_readings.humidity < plants.hum_min` in SQL.

---

## Prossime annaffiature (`$nextWaterings`)

```php
$nextWaterings = Plant::where('user_id', $userId)
    ->with(['wateringEvents' => fn($q) => $q->latest('watered_at')->limit(1)])
    ->get()
    ->sortBy(function ($plant) {
        $lastWatering = $plant->wateringEvents->first();
        $base = $lastWatering ? $lastWatering->watered_at : $plant->created_at;
        return $base->addHours($plant->watering_cycle);
    })
    ->take(3);
```

Carica tutte le piante con eager loading dell'ultima annaffiatura (limite 1 per pianta), poi ordina in PHP invece che in SQL. L'ordinamento richiede un calcolo derivato (`watered_at + watering_cycle ore`) che non è direttamente esprimibile in una `ORDER BY` SQL senza una colonna calcolata o una subquery complessa.

La data di riferimento (`$base`) è l'ultima annaffiatura se esiste, altrimenti la data di creazione della pianta: le piante mai annaffiate vengono comunque incluse nella lista, ordinate come se fossero state "annaffiate" al momento della creazione.

`.take(3)` viene applicato dopo `sortBy` sulla collection PHP: prende le tre piante con la prossima annaffiatura più imminente.

---

## Sezione "Le tue piante" (`$yourPlants`)

```php
$attentionIds = $attentionPlants->pluck('plant_id')->toArray();
$yourPlants   = collect($attentionPlants)->take(3);

if ($yourPlants->count() < 3) {
    $needed = 3 - $yourPlants->count();
    $randomPlants = Plant::where('user_id', $userId)
        ->whereNotIn('plant_id', $attentionIds)
        ->inRandomOrder()
        ->take($needed)
        ->get();
    $yourPlants = $yourPlants->merge($randomPlants);
}
```

La dashboard mostra sempre esattamente 3 piante nella sezione "Le tue piante". La priorità va alle piante fuori range: se ce ne sono 3 o più, vengono mostrate quelle. Se ce ne sono meno di 3, i posti rimanenti vengono riempiti con piante casuali tra quelle sane.

`whereNotIn('plant_id', $attentionIds)` esclude le piante fuori range già presenti per evitare duplicati. `inRandomOrder()` produce `ORDER BY RAND()` in MySQL: ad ogni caricamento della dashboard l'utente vede piante diverse tra quelle sane.

---

## Attività recente (`$recentActivity`)

```php
$activities = collect();

WateringEvent::whereHas('plant', fn($q) => $q->where('user_id', $userId))
    ->with('plant')
    ->latest('watered_at')
    ->take(4)
    ->get()
    ->each(fn($event) => $activities->push([
        'type'    => 'watering',
        'message' => "La pianta '{$event->plant->plant_name}' è stata annaffiata.",
        'date'    => $event->watered_at,
    ]));

Plant::where('user_id', $userId)
    ->latest('created_at')
    ->take(4)
    ->get()
    ->each(fn($plant) => $activities->push([
        'type'    => 'creation',
        'message' => "Nuova pianta registrata nel sistema: '{$plant->plant_name}'.",
        'date'    => $plant->created_at,
    ]));

SensorReading::whereHas('plant', fn($q) => $q->where('user_id', $userId))
    ->join('plants', 'sensor_readings.plant_id', '=', 'plants.plant_id')
    ->where(function ($q) {
        $q->whereColumn('sensor_readings.humidity', '<', 'plants.hum_min')
          // ... altri parametri fuori range ...
    })
    ->select('sensor_readings.*')
    ->latest('sensor_readings.recorded_at')
    ->take(4)
    ->get()
    ->each(fn($reading) => $activities->push([
        'type'    => 'warning',
        'message' => "Attenzione! I parametri di '{$reading->plant->plant_name}' sono fuori range.",
        'date'    => $reading->recorded_at,
    ]));

$recentActivity = $activities->sortByDesc('date')->take(4)->values();
```

La timeline viene costruita in tre query separate invece di una sola: annaffiature, creazioni piante e letture anomale hanno strutture diverse e non si prestano a una `UNION` semplice. Ogni query prende al massimo 4 elementi, poi la collection PHP viene unita, riordinata per data e troncata a 4 eventi totali.

La query sulle letture anomale usa un `join` esplicito invece di `whereHas`: serve per poter comparare `sensor_readings.*` con le colonne di `plants` nella clausola `WHERE`. Con solo `whereHas` non si avrebbe accesso alle colonne della tabella `plants` nella query principale.

`->select('sensor_readings.*')` dopo il `join` è necessario per evitare conflitti di nomi tra le colonne delle due tabelle (entrambe hanno `created_at`, `updated_at`, ecc.): senza la select esplicita Eloquent riceverebbe colonne ambigue.

`$reading->plant->plant_name` nel `each` finale funziona perché `whereHas` carica la relazione `plant` implicitamente quando la usa nel filtro. Questo è un caso di **N+1 potenziale**: se si volesse essere rigorosi si aggiungerebbe `->with('plant')` alla query delle letture anomale.
