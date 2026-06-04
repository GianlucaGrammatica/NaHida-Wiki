In locale il progetto usa **MySQL** (tramite XAMPP). Le tabelle di seguito sono quelle create e gestite direttamente dal progetto. Laravel genera e utilizza autonomamente anche altre tabelle di servizio: `sessions`, `cache`, `cache_locks`, `jobs`, `job_batches` e `failed_jobs`.

### `users`

Contiene gli account degli utenti registrati.

|Colonna|Tipo|Note|
|---|---|---|
|`user_id`|bigint unsigned|Chiave primaria|
|`email`|varchar(255)|Unica|
|`password`|varchar(255)|Hash bcrypt|
|`first_name`|varchar(255)||
|`last_name`|varchar(255)||
|`created_at`|timestamp||
|`updated_at`|timestamp||

### `plants`

Contiene le piante registrate da ogni utente, con le condizioni ottimali e le opzioni di personalizzazione del modello.

|Colonna|Tipo|Note|
|---|---|---|
|`plant_id`|bigint unsigned|Chiave primaria|
|`user_id`|bigint unsigned|FK → `users`|
|`plant_name`|varchar(255)||
|`notes`|text|Nullable|
|`hum_min`|float|Umidità aria minima (%)|
|`hum_max`|float|Umidità aria massima (%)|
|`temp_min`|float|Temperatura minima (°C)|
|`temp_max`|float|Temperatura massima (°C)|
|`soil_hum_min`|float|Umidità suolo minima (%)|
|`soil_hum_max`|float|Umidità suolo massima (%)|
|`lux_min`|float|Luminosità minima (lx), nullable, default 0|
|`lux_max`|float|Luminosità massima (lx), nullable, default 100000|
|`lum_preference`|enum|Valori: `low`, `medium`, `high`, `direct`. Nullable|
|`watering_cycle`|int|Ore tra un'annaffiatura e la successiva|
|`plant_variant`|varchar(255)|Indice variante grafica (0–7). Salvata come stringa, il model la casta a intero in lettura|
|`plant_color`|varchar(255)|Indice colore pianta (0–5). Salvata come stringa, il model la casta a intero in lettura|
|`flower_color`|varchar(255)|Indice colore fiori (0–6). Salvata come stringa, il model la casta a intero in lettura|
|`pot_color`|varchar(255)|Indice colore vaso (0–2). Salvata come stringa, il model la casta a intero in lettura|
|`created_at`|timestamp||
|`updated_at`|timestamp||

> **Nota:** `lux_min` e `lux_max` sono state aggiunte in una seconda migration (`2026_05_24_150214_add_lux_to_plants_table`), separata dalla creazione della tabella.

### `devices`

Associa un dispositivo fisico ESP8266 a una pianta. Un dispositivo è identificato da un token univoco hardcodato nel firmware.

|Colonna|Tipo|Note|
|---|---|---|
|`device_id`|bigint unsigned|Chiave primaria|
|`plant_id`|bigint unsigned|FK → `plants`, nullable (il device può esistere senza pianta associata)|
|`device_token`|varchar(255)|Unico, corrisponde a `DEVICE_TOKEN` nel firmware|
|`last_seen_at`|timestamp|Aggiornato a ogni messaggio ricevuto, nullable|
|`created_at`|timestamp||
|`updated_at`|timestamp||

> **Comportamento on delete:** quando una pianta viene eliminata, `plant_id` diventa `NULL` invece di eliminare il device (`nullOnDelete`). Al contrario, quando un utente viene eliminato, tutte le sue piante vengono eliminate a cascata (`cascadeOnDelete`), trascinando con sé anche i device, le letture e gli eventi.

### `sensor_readings`

Ogni lettura periodica inviata dal dispositivo viene salvata qui. Non ha timestamps di Laravel perché `recorded_at` sostituisce `created_at`.

|Colonna|Tipo|Note|
|---|---|---|
|`reading_id`|bigint unsigned|Chiave primaria|
|`plant_id`|bigint unsigned|FK → `plants`|
|`humidity`|float|Umidità aria (%)|
|`temperature`|float|Temperatura (°C)|
|`soil_humidity`|float|Umidità suolo (%)|
|`luminosity`|float|Luminosità (lx), nullable|
|`recorded_at`|timestamp|Orario della lettura|

### `watering_events`

Registra ogni annaffiatura, distinguendo se è avvenuta tramite il bottone fisico, manualmente dall'app o (in futuro) in modo automatico.

|Colonna|Tipo|Note|
|---|---|---|
|`watering_id`|bigint unsigned|Chiave primaria|
|`plant_id`|bigint unsigned|FK → `plants`|
|`watered_at`|timestamp|Orario dell'annaffiatura|
|`source`|enum|Valori: `button`, `manual_app`, `scheduled`|

> **Nota:** `watering_events` non ha `updated_at` né `created_at` (il model dichiara `public $timestamps = false`). `watered_at` viene impostato automaticamente dall'hook `booted()` del model se non fornito esplicitamente.