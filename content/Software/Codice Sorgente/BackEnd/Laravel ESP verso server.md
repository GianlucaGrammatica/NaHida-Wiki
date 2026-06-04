# Laravel: Flusso ESP → Server
Questa pagina documenta il percorso di un messaggio dal momento in cui l'ESP lo pubblica sul broker MQTT fino a quando il frontend riceve l'aggiornamento in tempo reale via WebSocket.

```
ESP8266
  └─ pubblica su device/{TOKEN}/updates  (JSON sensor_data o "BUTTON_PRESSED")
  └─ pubblica su device/{TOKEN}/status   ("ONLINE")

MqttListener (processo Artisan long-running)
  └─ riceve, identifica il dispositivo tramite token
  └─ sensor_data  → salva SensorReading → event(SensorUpdated)
  └─ BUTTON_PRESSED → salva WateringEvent → event(ButtonPressed)
  └─ ONLINE → aggiorna last_seen_at

SensorUpdated / ButtonPressed (ShouldBroadcast)
  └─ canale plant.{plant_id}
  └─ Reverb trasmette al browser via WebSocket

Frontend (Laravel Echo)
  └─ aggiorna sensori, badge salute, modello Live2D
```

Per il comportamento dell'ESP lato publish vedi [[Codice Sorgente - Firmware]]. Per come il frontend usa i dati ricevuti vedi [[Laravel: Pipeline Real-time Frontend]].

---
## MqttListener
`app/Console/Commands/MqttListener.php`

```php
<?php

namespace App\Console\Commands;

use App\Events\ButtonPressed;
use App\Events\SensorUpdated;
use App\Models\Device;
use App\Models\SensorReading;
use App\Models\WateringEvent;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use PhpMqtt\Client\Facades\MQTT;

class MqttListener extends Command
{
    protected $signature = 'mqtt:listen';
    protected $description = 'Ascolta i messaggi MQTT in arrivo dagli ESP';

    public function handle(): void
    {
        $this->info('🌿 MQTT Listener avviato, in ascolto...');

        $mqtt = MQTT::connection();

        $mqtt->subscribe('device/+/updates', function (string $topic, string $message) {
            $token  = explode('/', $topic)[1];
            $device = $this->findDevice($token);
            if (!$device) return;

            $data = json_decode($message, true);

            if (json_last_error() === JSON_ERROR_NONE && isset($data['type'])) {
                $this->handleJson($data, $device);
            } else {
                $this->handlePlainMessage($message, $device);
            }
        }, 1);

        $mqtt->subscribe('device/+/status', function (string $topic, string $message) {
            $token  = explode('/', $topic)[1];
            $device = $this->findDevice($token);
            if (!$device) return;

            if ($message === 'ONLINE') {
                $device->last_seen_at = now();
                $device->save();
            }
        }, 0);

        $mqtt->loop(true);
    }
```

`mqtt:listen` è un comando Artisan con `$mqtt->loop(true)` alla fine: `loop(true)` avvia un ciclo bloccante che tiene il processo in vita indefinitamente, ricevendo i messaggi man mano che arrivano. Il processo viene avviato all'avvio del container Docker insieme a `php artisan serve` e `reverb:start` tramite `concurrently`. Vedi [[Deploy: Dockerfile]].

La sottoscrizione usa wildcard MQTT `device/+/updates`: il `+` corrisponde a qualsiasi singolo segmento di topic, quindi un solo subscribe cattura i messaggi di tutti i dispositivi. Il token viene estratto con `explode('/', $topic)[1]` (secondo segmento del topic).

Il topic `/status` usa QoS 0 (ultimo argomento di `subscribe`): i ping di presenza non hanno bisogno di garanzie di consegna. Il topic `/updates` usa QoS 1: le letture dei sensori e gli eventi bottone non devono andare persi.

### `findDevice()`

```php
    private function findDevice(string $token): ?Device
    {
        $device = Device::where('device_token', $token)->first();

        if (!$device) {
            $this->warn("[{$token}] Dispositivo non trovato nel DB, messaggio ignorato.");
            Log::warning("MQTT: token sconosciuto '{$token}'");
        }

        return $device;
    }
```

Ogni messaggio viene accettato solo se il token corrisponde a un dispositivo registrato nel database. Se un ESP non è stato collegato a nessuna pianta tramite l'interfaccia web, i suoi messaggi vengono scartati. Questo è il meccanismo di autorizzazione del dispositivo: non c'è firma crittografica sul payload, l'identità è il token stesso.
### Distinzione JSON vs plain text

```php
$data = json_decode($message, true);

if (json_last_error() === JSON_ERROR_NONE && isset($data['type'])) {
    $this->handleJson($data, $device);
} else {
    $this->handlePlainMessage($message, $device);
}
```

Il topic `/updates` è bidirezionale (l'ESP pubblica qui sia la telemetria che il bottone, e il server pubblica qui i comandi per l'ESP). La distinzione tra i due tipi di messaggio in ingresso avviene controllando se il payload è JSON valido con un campo `type`. Se `json_decode` fallisce o `type` è assente, il messaggio viene trattato come stringa plain.
### `handleJson()`

```php
    private function handleJson(array $data, Device $device): void
    {
        switch ($data['type']) {
            case 'sensor_data':
                $reading = SensorReading::create([
                    'plant_id'      => $device->plant_id,
                    'humidity'      => $data['humidity']      ?? null,
                    'temperature'   => $data['temperature']   ?? null,
                    'soil_humidity' => $data['soil_humidity']  ?? null,
                    'luminosity'    => $data['luminosity']     ?? null,
                ]);

                event(new SensorUpdated(
                    plantId:       $device->plant_id,
                    humidity:      $reading->humidity,
                    temperature:   $reading->temperature,
                    soil_humidity: $reading->soil_humidity,
                    luminosity:    $reading->luminosity,
                    recordedAt:    $reading->recorded_at->toDateTimeString(),
                ));

                $device->last_seen_at = now();
                $device->save();
                break;

            default:
                $this->warn("[{$device->device_token}] Tipo JSON sconosciuto: {$data['type']}");
                break;
        }
    }
```

`SensorReading::create()` non riceve `recorded_at` esplicitamente: il model ha un hook `booted()` che lo imposta a `now()` se è null. I campi vengono passati con `?? null` invece di accedere direttamente all'array, così un payload parziale non genera un errore ma salva `null` nei campi mancanti.

`event(new SensorUpdated(...))` viene chiamato dopo il salvataggio usando i valori della `$reading` appena creata, non quelli del payload grezzo. Questo garantisce che i dati broadcastati siano identici a quelli salvati nel database (inclusi eventuali cast Eloquent).
### `handlePlainMessage()`

```php
    private function handlePlainMessage(string $message, Device $device): void
    {
        switch ($message) {
            case 'BUTTON_PRESSED':
                WateringEvent::create([
                    'plant_id' => $device->plant_id,
                    'source'   => 'button',
                ]);
                event(new ButtonPressed($device->plant_id, "Pianta #{$device->plant_id} annaffiata! 💧"));
                $device->last_seen_at = now();
                $device->save();
                break;

            default:
                $this->warn("[{$device->device_token}] Messaggio sconosciuto: {$message}");
                break;
        }
    }
}
```

`WateringEvent::create()` non riceve `watered_at`: anche qui il model ha un hook `booted()` che lo imposta a `now()`. Il campo `source` viene impostato a `'button'` per distinguere questa annaffiatura da quelle registrate manualmente dall'app o programmate. Vedi [[NaHida/Wiki/Software/Database]] per l'enum completo.

---
## SensorUpdated
`app/Events/SensorUpdated.php`

```php
<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class SensorUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public int        $plantId,
        public float|null $humidity,
        public float|null $temperature,
        public float|null $soil_humidity,
        public float|null $luminosity,
        public string     $recordedAt,
    ) {}

    public function broadcastOn(): array
    {
        return [new Channel("plant.{$this->plantId}")];
    }

    public function broadcastAs(): string
    {
        return 'SensorUpdated';
    }
}
```

L'evento implementa `ShouldBroadcast` (non `ShouldBroadcastNow`): la differenza è che `ShouldBroadcast` passa per il driver della coda, mentre `ShouldBroadcastNow` bypassa la coda e trasmette immediatamente. Con `QUEUE_CONNECTION=sync` (default Laravel) i due si comportano allo stesso modo. Se si configurasse una coda asincrona (Redis), `ShouldBroadcast` andrebbe in background e `ShouldBroadcastNow` trasmette comunque in linea.

Il canale `plant.{plantId}` è un `Channel` pubblico (non `PrivateChannel`): chiunque conosca l'ID della pianta può iscriversi senza autenticazione. Per questo progetto è una semplificazione accettabile, ma in un sistema produttivo si userebbe un `PrivateChannel` con la verifica in `routes/channels.php`.

`broadcastAs()` restituisce `'SensorUpdated'`: Reverb usa questo nome come nome dell'evento nel payload WebSocket. Il frontend lo ascolta con il prefisso punto (`.SensorUpdated`) che è la convenzione di Laravel Echo per gli eventi con nome custom.

Tutti i campi del costruttore sono `public`: Reverb li serializza automaticamente come payload dell'evento senza bisogno di un metodo `broadcastWith()`.

---
## ButtonPressed
`app/Events/ButtonPressed.php`

```php
<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ButtonPressed implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public int $plantId;
    public string $message;

    public function __construct(int $plantId, string $message)
    {
        $this->plantId = $plantId;
        $this->message = $message;
    }

    public function broadcastOn(): array
    {
        return [new Channel("plant.{$this->plantId}")];
    }

    public function broadcastAs(): string
    {
        return 'ButtonPressed';
    }
}
```

La struttura è identica a `SensorUpdated`: stesso canale `plant.{plantId}`, stesso pattern di broadcast. La differenza è che il payload è minimale (solo `plantId` e `message` testuale) perché la pressione del bottone non porta dati di sensori ma scatena una reazione visiva sul frontend (animazione di annaffiatura del modello Live2D) e aggiorna il timer della prossima annaffiatura.

---
## Frontend: ricezione via Echo
Snippet da `resources/js/pages/plants_show.js`:

```javascript
function initEcho() {
    if (!window.Echo || !PLANT_ID) return;

    Echo.channel(`plant.${PLANT_ID}`)
        .listen('.SensorUpdated', (e) => {
            window.PLANT_HEALTH = {
                temperature:   e.temperature,
                humidity:      e.humidity,
                soil_humidity: e.soil_humidity,
                luminosity:    e.luminosity,
            };

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
```

Il prefisso `.` nei nomi degli eventi (`.SensorUpdated`, `.ButtonPressed`) è obbligatorio quando si usa `broadcastAs()` con un nome custom: Echo senza il punto cercherebbe il nome nel formato namespace completo Laravel.

`window._lastEchoUpdate = Date.now()` registra il timestamp dell'ultimo evento WebSocket ricevuto. Il polling AJAX di fallback (ogni 15s) controlla questo valore e salta la chiamata se l'Echo è aggiornato da meno di 20 secondi, evitando richieste ridondanti quando la connessione WebSocket funziona regolarmente. Vedi [[Laravel: Pipeline Real-time Frontend]].