# Sicurezza

Questa pagina raccoglie le scelte di sicurezza del progetto, distribuite tra firmware, backend e frontend. È organizzata per area di rischio, con i relativi snippet di codice.

---

## Autenticazione utente

### Hash della password

`app/Models/User.php`

```php
protected function casts(): array
{
    return [
        'password' => 'hashed',
    ];
}
```

Il cast `'hashed'` di Laravel applica automaticamente `bcrypt` ogni volta che viene assegnato un valore alla property `password`. Non è possibile salvare una password in chiaro per dimenticanza: il cast opera a livello di model, prima della scrittura nel database.

Il costo computazionale di bcrypt è regolabile tramite `config/hashing.php` (default: `rounds = 12`). Aumentare i rounds rallenta il login ma rende il brute force più costoso.

### Rate limiting sul login

`app/Http/Requests/Auth/LoginRequest.php`

```php
public function authenticate(): void
{
    $this->ensureIsNotRateLimited();

    if (! Auth::attempt($this->only('email', 'password'), $this->boolean('remember'))) {
        RateLimiter::hit($this->throttleKey());
        throw ValidationException::withMessages([
            'email' => trans('auth.failed'),
        ]);
    }

    RateLimiter::clear($this->throttleKey());
}

public function ensureIsNotRateLimited(): void
{
    if (! RateLimiter::tooManyAttempts($this->throttleKey(), 5)) {
        return;
    }
    event(new Lockout($this));
    $seconds = RateLimiter::availableIn($this->throttleKey());
    throw ValidationException::withMessages([
        'email' => trans('auth.throttle', [
            'seconds' => $seconds,
            'minutes' => ceil($seconds / 60),
        ]),
    ]);
}

public function throttleKey(): string
{
    return Str::transliterate(Str::lower($this->string('email')).'|'.$this->ip());
}
```

Dopo 5 tentativi falliti con la stessa combinazione email + IP, ulteriori tentativi vengono bloccati finché il rate limiter non scade. La chiave include sia l'email che l'IP: questo blocca sia gli attacchi a dizionario su un singolo account da IP diversi (parzialmente), sia i tentativi multipli dallo stesso IP su account diversi.

Il messaggio di errore per credenziali errate (`auth.failed`) è intenzionalmente generico: non distingue tra "email non esiste" e "password sbagliata", per non rivelare quali account esistono nel sistema.

---

## Protezione CSRF

Tutte le chiamate AJAX dal frontend includono il token CSRF nell'header:

`resources/js/pages/plants_show.js`

```javascript
function csrf() {
    return document.querySelector('meta[name="csrf-token"]')?.content ?? '';
}

async function apiRequest(url, method = 'GET', body = null) {
    const opts = {
        method,
        headers: {
            'Content-Type':     'application/json',
            'X-CSRF-TOKEN':     csrf(),
            'X-Requested-With': 'XMLHttpRequest',
        },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    return res.json();
}
```

Il token viene letto dal meta tag `<meta name="csrf-token">` generato da Laravel nel layout. Laravel verifica che ogni richiesta `POST`, `PATCH`, `PUT`, `DELETE` includa il token corrispondente alla sessione dell'utente: senza di esso la richiesta viene rifiutata con 419.

`X-Requested-With: XMLHttpRequest` segnala a Laravel che la richiesta è AJAX, attivando le risposte JSON per gli errori invece dei redirect.

---

## Ownership delle risorse

Ogni controller verifica che la risorsa richiesta appartenga all'utente autenticato prima di qualsiasi operazione:

```php
// PlantsController
$plant = Plant::where('user_id', $request->user()->user_id)->findOrFail($id);

// DeviceController
$plant = Plant::where('user_id', $request->user()->user_id)->findOrFail($plantId);
```

La clausola `where('user_id', ...)` viene applicata prima di `findOrFail`: se l'utente A tenta di accedere alla pianta dell'utente B conoscendone l'ID, la query non trova nessun record e restituisce 404. Il 404 è preferibile al 403 perché non conferma l'esistenza della risorsa.

---

## Autorizzazione del dispositivo IoT

Il dispositivo non si autentica con username e password MQTT propri: l'identità è il `DEVICE_TOKEN`, una stringa unica hardcoded nel firmware e salvata nel database.

```php
// MqttListener
private function findDevice(string $token): ?Device
{
    $device = Device::where('device_token', $token)->first();
    if (!$device) {
        Log::warning("MQTT: token sconosciuto '{$token}'");
    }
    return $device;
}
```

Se un messaggio arriva da un token non registrato, viene scartato silenziosamente. Il modello di sicurezza si basa sulla segretezza del token: chiunque conosca il token di un dispositivo può pubblicare messaggi che il server accetterà come legittimi.

Questo è sufficiente per un progetto IoT domestico ma non per un sistema produttivo, dove si userebbero certificati client TLS per autenticare ogni dispositivo sul broker.

---

## TLS sulla connessione MQTT

`main.cpp` (firmware)

```cpp
espClient.setInsecure();
```

`WiFiClientSecure` con `setInsecure()` cifra la connessione con TLS ma non valida il certificato del broker. I dati sono cifrati in transito, ma un attaccante in grado di fare MITM (Man In The Middle) sulla rete potrebbe presentare un certificato falso senza essere rilevato.

La scelta è pragmatica: validare il certificato richiederebbe di caricare il certificato CA nel firmware, aumentare la memoria usata e gestire la rotazione del certificato quando scade. Per un dispositivo su rete domestica il rischio MITM è considerato accettabile.

Sul lato server, HiveMQ Cloud gestisce i certificati TLS automaticamente. La libreria PHP `php-mqtt/laravel-client` si connette tramite TLS senza configurazioni aggiuntive, con validazione completa del certificato.

---

## Protezione dei dati JavaScript

`resources/js/config/bridge.js`

```javascript
const data = document.querySelector("meta[name='params']");
const temp = JSON.parse(data.getAttribute("content") || "{}");
data.remove();
return temp;
```

Dopo la lettura, il meta tag `params` viene rimosso dal DOM con `.remove()`. Questo evita che i dati dell'utente (configurazioni della pianta, token del dispositivo) rimangano accessibili a script iniettati o estensioni del browser dopo il caricamento.

Il meta tag `env` espone solo le variabili con prefisso `VITE_`, filtrate nel Blade:

```php
collect($_ENV)->concat(getenv())
    ->filter(fn($value, $key) => str_starts_with($key, 'VITE_'))
    ->all()
```

Variabili come `DB_PASSWORD`, `MQTT_PASS` o `APP_KEY` non vengono mai serializzate nella pagina.

---

## Validazione input

Tutti gli input dell'utente vengono validati lato server prima di qualsiasi operazione su database o MQTT. Alcuni esempi significativi:

```php
// StorePlantRequest: cross-field validation
'hum_max' => ['required', 'numeric', 'min:0', 'max:100', 'gte:hum_min'],
'temp_max' => ['required', 'numeric', 'min:-10', 'max:60', 'gte:temp_min'],

// DeviceController: token deve esistere nel DB
'device_token' => 'required|string|exists:devices,device_token',

// DeviceController: azione LED è un enum
'action' => 'required|in:ON,OFF',

// PlantsController update: range valori aspetto
'plant_variant' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:7'],
```

La regola `exists:devices,device_token` verifica che il token esista nel database prima di pubblicare qualsiasi comando MQTT: impedisce di inviare messaggi a dispositivi non registrati o di enumerare token validi tramite la risposta del server.

La regola `in:ON,OFF` per il LED è un esempio di validazione a whitelist: solo i valori esplicitamente ammessi passano, nessuna stringa arbitraria può raggiungere il publish MQTT.
