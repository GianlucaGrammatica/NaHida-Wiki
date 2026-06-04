# Laravel: Modelli Eloquent

Questa pagina documenta i modelli Eloquent del progetto: le scelte sulle chiavi primarie, i cast dei tipi, le relazioni e i hook `booted()`. Per lo schema completo delle tabelle vedi [[Database]].

---

## Chiavi primarie custom

Laravel assume per default che ogni tabella abbia una chiave primaria chiamata `id`. Tutte le tabelle di questo progetto usano nomi diversi (`user_id`, `plant_id`, `device_id`, ecc.), quindi ogni model dichiara esplicitamente la propria chiave:

```php
// Plant.php
protected $primaryKey = 'plant_id';

// Device.php
protected $primaryKey = 'device_id';

// SensorReading.php
protected $primaryKey = 'reading_id';

// WateringEvent.php
protected $primaryKey = 'watering_id';

// User.php
protected $primaryKey = 'user_id';
```

Senza questa dichiarazione, Eloquent cercherebbe di leggere e scrivere una colonna `id` che non esiste, causando errori su tutte le query. La dichiarazione cambia anche il comportamento di `findOrFail($id)`, `route model binding` e la generazione degli URL nelle route con parametro.

---

## `User`

`app/Models/User.php`

```php
#[Fillable(['first_name', 'last_name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    use HasFactory, Notifiable;

    protected $primaryKey = 'user_id';

    public function getNameAttribute(): string
    {
        return "{$this->first_name} {$this->last_name}";
    }

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password'          => 'hashed',
        ];
    }
}
```

`User` usa i nuovi attributi PHP 8 `#[Fillable]` e `#[Hidden]` invece delle property `$fillable` e `$hidden`. Il risultato è identico, ma la sintassi a attributo è più compatta.

Il cast `'password' => 'hashed'` è introdotto in Laravel 10: quando si assegna una stringa a `$user->password`, Eloquent la hasha automaticamente con bcrypt senza bisogno di chiamare `Hash::make()` esplicitamente nel controller.

`getNameAttribute()` è un accessor: `$user->name` restituisce nome e cognome concatenati anche se la colonna `name` non esiste nel database. Laravel riconosce il pattern `get{Attribute}Attribute`.

---

## `Plant`

`app/Models/Plant.php`

```php
class Plant extends Model
{
    protected $primaryKey = 'plant_id';

    protected $fillable = [
        'user_id', 'plant_name', 'notes',
        'hum_min', 'hum_max', 'temp_min', 'temp_max',
        'soil_hum_min', 'soil_hum_max',
        'lum_preference', 'watering_cycle',
        'plant_variant', 'plant_color', 'flower_color', 'pot_color',
    ];

    protected $casts = [
        'hum_min' => 'float', 'hum_max' => 'float',
        'temp_min' => 'float', 'temp_max' => 'float',
        'soil_hum_min' => 'float', 'soil_hum_max' => 'float',
        'watering_cycle' => 'integer',
        'plant_variant'  => 'integer',
        'plant_color'    => 'integer',
        'flower_color'   => 'integer',
        'pot_color'      => 'integer',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'user_id');
    }

    public function device(): HasOne
    {
        return $this->hasOne(Device::class, 'plant_id', 'plant_id');
    }

    public function sensorReadings(): HasMany
    {
        return $this->hasMany(SensorReading::class, 'plant_id', 'plant_id');
    }

    public function wateringEvents(): HasMany
    {
        return $this->hasMany(WateringEvent::class, 'plant_id', 'plant_id');
    }
}
```

I cast garantiscono che i valori numerici restituiti da Eloquent siano sempre del tipo corretto in PHP. Senza i cast, MySQL restituisce i numeri come stringhe e un confronto come `$reading->temperature < $plant->temp_min` funzionerebbe comunque in PHP (per la coercizione di tipo), ma invierebbe stringhe al JavaScript tramite `json_encode` invece di numeri, potendo causare problemi nei grafici o nei confronti lato client.

Le relazioni usano i nomi delle colonne esplicitamente come secondo e terzo argomento: `belongsTo(User::class, 'user_id', 'user_id')`. Senza questi argomenti Eloquent cercherebbe la chiave esterna `user_id` sulla tabella `plants` (corretto) ma la chiave primaria `id` sulla tabella `users` (sbagliato, si chiama `user_id`).

> Nota: nel sorgente il campo `$fillable` contiene `'lux_min' => 'float'` e `'lux_max' => 'float'` con la sintassi chiave-valore invece di valore semplice. Questo li esclude da `$fillable` (diventano chiavi numeriche con valore stringa) e li rende non mass-assignable. Il cast per questi campi sta correttamente in `$casts`. Se si vuole che `lux_min` e `lux_max` siano fillable, vanno aggiunti come `'lux_min'` e `'lux_max'` senza il valore.

---

## `Device`

`app/Models/Device.php`

```php
class Device extends Model
{
    protected $primaryKey = 'device_id';

    protected $fillable = [
        'plant_id',
        'device_token',
        'last_seen_at',
    ];

    protected $casts = [
        'last_seen_at' => 'datetime',
    ];

    public function plant(): BelongsTo
    {
        return $this->belongsTo(Plant::class, 'plant_id', 'plant_id');
    }
}
```

`last_seen_at` ha il cast `'datetime'`: Eloquent lo converte automaticamente in un oggetto Carbon alla lettura. Questo permette di chiamare `$device->last_seen_at->diffInSeconds(now())` direttamente nel controller senza dover fare `Carbon::parse()` ogni volta.

`last_seen_at` è incluso in `$fillable` perché `DeviceController::linkDevice()` crea dispositivi senza averlo, e `MqttListener` lo aggiorna con `$device->last_seen_at = now(); $device->save()`. Non usare `update()` con mass assignment per questo campo significa che il cast funziona correttamente anche quando il valore viene assegnato direttamente alla property.

---

## `SensorReading`

`app/Models/SensorReading.php`

```php
class SensorReading extends Model
{
    protected $primaryKey = 'reading_id';
    public $timestamps = false;

    protected $fillable = [
        'plant_id', 'humidity', 'temperature',
        'soil_humidity', 'luminosity', 'recorded_at',
    ];

    protected $casts = [
        'humidity'      => 'float',
        'temperature'   => 'float',
        'soil_humidity' => 'float',
        'luminosity'    => 'float',
        'recorded_at'   => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (SensorReading $reading) {
            $reading->recorded_at ??= now();
        });
    }

    public function plant(): BelongsTo
    {
        return $this->belongsTo(Plant::class, 'plant_id', 'plant_id');
    }
}
```

`public $timestamps = false` disabilita la gestione automatica di `created_at` e `updated_at`: la tabella non ha queste colonne, usa `recorded_at` al loro posto. Senza questa dichiarazione Eloquent lancerebbe un errore SQL cercando di scrivere su colonne inesistenti.

L'hook `booted()` con `static::creating` viene eseguito automaticamente prima di ogni `INSERT`. `$reading->recorded_at ??= now()` usa l'operatore null-coalescing assignment: se `recorded_at` non è stato impostato esplicitamente, viene usato il timestamp corrente. Questo permette al `MqttListener` di chiamare `SensorReading::create([...])` senza passare il campo, ricevendo comunque un timestamp preciso.

---

## `WateringEvent`

`app/Models/WateringEvent.php`

```php
class WateringEvent extends Model
{
    protected $primaryKey = 'watering_id';
    public $timestamps = false;

    protected $fillable = [
        'plant_id', 'watered_at', 'source',
    ];

    protected $casts = [
        'watered_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (WateringEvent $event) {
            $event->watered_at ??= now();
        });
    }

    public function plant(): BelongsTo
    {
        return $this->belongsTo(Plant::class, 'plant_id', 'plant_id');
    }
}
```

Struttura speculare a `SensorReading`: `$timestamps = false`, hook `booted()` per il timestamp automatico, cast `datetime` su `watered_at`. Il campo `source` è un enum nel database (`button`, `manual_app`, `scheduled`) ma non ha un cast PHP specifico: viene letto e scritto come stringa.

---

## Relazioni: schema riassuntivo

```
User (user_id)
  └── hasMany → Plant (user_id)
                  └── hasOne  → Device (plant_id)
                  └── hasMany → SensorReading (plant_id)
                  └── hasMany → WateringEvent (plant_id)
```

Ogni relazione dichiara esplicitamente sia la foreign key che la owner key perché nessuna delle chiavi primarie segue la convenzione `id` di Laravel. La convenzione di Eloquent per `belongsTo(Plant::class)` sarebbe di cercare `plant_id` sulla tabella corrente (corretto) e `id` sulla tabella `plants` (sbagliato).
