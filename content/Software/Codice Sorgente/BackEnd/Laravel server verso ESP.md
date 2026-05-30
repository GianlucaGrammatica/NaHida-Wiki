# Laravel: Flusso Server → ESP
Questa pagina documenta il percorso inverso: le azioni dell'utente nel frontend che si traducono in comandi MQTT verso il dispositivo fisico, più la gestione del collegamento tra un dispositivo e una pianta.

```
Utente (frontend)
  └─ AJAX POST/GET → DeviceController

DeviceController
  └─ sendConfig()   → pubblica config su device/{TOKEN}/config   (QoS 1, retain)
  └─ sendMusic()    → pubblica comando su device/{TOKEN}/updates
  └─ toggleLed()    → pubblica ON/OFF su device/{TOKEN}
  └─ getStatus()    → legge last_seen_at dal DB, restituisce online/offline
  └─ linkDevice()   → collega token a pianta nel DB
  └─ unlinkDevice() → rimuove il collegamento dal DB

ESP8266
  └─ mqttCallback() riceve config e comandi
```

Per come l'ESP gestisce i messaggi ricevuti vedi [[Ricezione MQTT - mqttCallback()]]. Le route che espongono questi endpoint stanno in `routes/web.php` fuori dal gruppo auth: sono chiamate solo dal frontend autenticato tramite CSRF, ma non hanno il middleware `auth` applicato direttamente.

---
## `sendConfig()`

```php
public function sendConfig(Request $request): JsonResponse
{
    $request->validate([
        'device_token' => 'required|string|exists:devices,device_token',
    ]);

    $token  = $request->input('device_token');
    $device = Device::where('device_token', $token)->firstOrFail();
    $plant  = Plant::findOrFail($device->plant_id);

    $payload = json_encode([
        'plant_name'   => $plant->plant_name,
        'hum_min'      => $plant->hum_min,
        'hum_max'      => $plant->hum_max,
        'temp_min'     => $plant->temp_min,
        'temp_max'     => $plant->temp_max,
        'soil_hum_min' => $plant->soil_hum_min,
        'soil_hum_max' => $plant->soil_hum_max,
        'lux_min'      => $plant->lux_min ?? 0.0,
        'lux_max'      => $plant->lux_max ?? 100000.0,
    ]);

    MQTT::connection()->publish("device/{$token}/config", $payload, 1, true);

    return response()->json(['status' => 'Config inviata', 'payload' => json_decode($payload)]);
}
```

`publish()` riceve quattro argomenti: topic, payload, QoS, retain. Qui QoS è 1 (at-least-once) e `retain` è `true`.

Il flag `retain` è la scelta più importante di questa funzione: quando un messaggio retained viene pubblicato su un topic, il broker lo memorizza e lo riconsegna automaticamente a qualsiasi client che si iscriva a quel topic in futuro. Questo significa che ogni volta che l'ESP si riconnette al broker e si re-iscrive a `device/{TOKEN}/config`, riceve subito l'ultima configurazione senza che il server Laravel debba fare nulla. Il server pubblica la config una volta, il broker la mantiene disponibile.

`sendConfig()` viene chiamata dal frontend in tre momenti: dopo aver collegato un dispositivo a una pianta, dopo aver salvato le condizioni ottimali aggiornate, e dopo aver cambiato nome o aspetto della pianta (il nome viene mostrato sull'OLED).

---
## `sendMusic()`

```php
public function sendMuic(Request $request): JsonResponse
{
    $request->validate([
        'device_token' => 'required|string|exists:devices,device_token',
        'source'       => 'required|integer|min:-1',
    ]);

    $token  = $request->input('device_token');
    $source = $request->input('source');

    $payload = json_encode([
        'command' => 'PLAY_MUSIC',
        'source'  => $source,
    ]);

    MQTT::connection()->publish("device/{$token}/updates", $payload, 0, false);

    return response()->json(['status' => 'Music inviata', 'payload' => json_decode($payload)]);
}
```

Questo comando viene pubblicato sul topic `/updates`, lo stesso su cui l'ESP pubblica la telemetria. Il dispositivo distingue i messaggi in ingresso dal contenuto JSON: se c'è un campo `command`, è un comando server. Vedi [[Ricezione MQTT - mqttCallback()]].

QoS 0 e retain false: la riproduzione musicale non è critica, se il messaggio viene perso l'utente può semplicemente reinviarlo. Un messaggio retained qui sarebbe problematico perché farebbe partire la musica ad ogni riconnessione dell'ESP.

`source` accetta `-1` come valore speciale per fermare la riproduzione. Valori da 1 in su corrispondono ai numeri di traccia sulla SD card del DFPlayer.

---
## `toggleLed()`

```php
public function toggleLed(Request $request): JsonResponse
{
    $request->validate([
        'action'       => 'required|in:ON,OFF',
        'device_token' => 'required|string|exists:devices,device_token',
    ]);

    $action = $request->input('action');
    $token  = $request->input('device_token');

    MQTT::connection()->publish("device/{$token}", $action, 0, false);

    return response()->json(['status' => "LED {$action} inviato"]);
}
```

A differenza di `sendConfig` e `sendMusic`, questo endpoint pubblica sul topic base `device/{TOKEN}` senza suffisso. È una funzione di test/debug accessibile dalla pagina `test.blade.php` del progetto. Il payload è la stringa plain `"ON"` o `"OFF"`, non JSON.

---
## `getStatus()`

```php
public function getStatus(Request $request): JsonResponse
{
    $request->validate([
        'device_token' => 'required|string|exists:devices,device_token',
    ]);

    $device   = Device::where('device_token', $request->input('device_token'))->firstOrFail();
    $isOnline = $device->last_seen_at && $device->last_seen_at->diffInSeconds(now()) < 30;

    return response()->json([
        'online'       => $isOnline,
        'last_seen_at' => $device->last_seen_at?->toDateTimeString(),
    ]);
}
```

Lo stato online/offline si determina esclusivamente da `last_seen_at`: se l'ultimo messaggio ricevuto (qualsiasi messaggio, non solo il ping `/status`) risale a meno di 30 secondi fa, il dispositivo è considerato online. L'ESP pubblica ogni 10 secondi, quindi 30 secondi è una finestra che tollera una lettura saltata prima di dichiarare il dispositivo offline.

`last_seen_at` viene aggiornato dal `MqttListener` ad ogni messaggio ricevuto (sensor_data, BUTTON_PRESSED, ONLINE), non solo dai ping espliciti.

Il frontend chiama questo endpoint ogni 15 secondi in polling per aggiornare il badge di stato nella pagina dettaglio pianta.

---
## `linkDevice()`

```php
public function linkDevice(Request $request, int $plantId): JsonResponse
{
    $request->validate([
        'device_token' => 'required|string|max:255',
    ]);

    $plant = Plant::where('user_id', $request->user()->user_id)->findOrFail($plantId);

    Device::where('plant_id', $plantId)->delete();

    Device::where('device_token', $request->device_token)->delete();

    $device = Device::create([
        'plant_id'     => $plant->plant_id,
        'device_token' => $request->device_token,
    ]);

    return response()->json([
        'status'       => 'ok',
        'device_token' => $device->device_token,
    ]);
}
```

Prima di creare il nuovo collegamento vengono eseguite due delete:

La prima rimuove qualsiasi dispositivo già collegato a quella pianta: una pianta può avere al massimo un dispositivo, quindi il vecchio viene rimpiazzato.

La seconda rimuove qualsiasi record che usi già quel token, anche se era collegato a una pianta diversa: un token fisico identifica un ESP specifico, non può essere condiviso tra due piante. Questo impedisce che lo stesso device riceva la configurazione di due piante diverse.

`Plant::where('user_id', ...)->findOrFail($plantId)` verifica che la pianta appartenga all'utente autenticato prima di procedere: senza questo controllo un utente potrebbe collegare un dispositivo a una pianta di un altro utente.

---
## `unlinkDevice()`

```php
public function unlinkDevice(Request $request, int $plantId): JsonResponse
{
    Plant::where('user_id', $request->user()->user_id)->findOrFail($plantId);

    Device::where('plant_id', $plantId)->delete();

    return response()->json(['status' => 'ok']);
}
```

La verifica di ownership sulla pianta avviene comunque prima della delete, anche se il risultato del `findOrFail` non viene usato. Senza quella riga un utente potrebbe scollegare il dispositivo da qualsiasi pianta conoscendone l'ID.