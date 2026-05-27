Il database è MySQL. Le tabelle di seguito sono quelle create e gestite direttamente dal progetto. Laravel genera e utilizza autonomamente anche altre tabelle di servizio: `sessions`, `cache`, `cache_locks`, `jobs`, `job_batches` e `failed_jobs`.

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
|`hum_min`|double|Umidità aria minima (%)|
|`hum_max`|double|Umidità aria massima (%)|
|`temp_min`|double|Temperatura minima (°C)|
|`temp_max`|double|Temperatura massima (°C)|
|`soil_hum_min`|double|Umidità suolo minima (%)|
|`soil_hum_max`|double|Umidità suolo massima (%)|
|`lux_min`|double|Luminosità minima (lx), nullable|
|`lux_max`|double|Luminosità massima (lx), nullable|
|`lum_preference`|enum|`low`, `medium`, `high`, `direct` — nullable|
|`watering_cycle`|int|Ore tra un'annaffiatura e la successiva|
|`plant_variant`|varchar(255)|Indice variante grafica del modello|
|`plant_color`|varchar(255)|Indice colore pianta|
|`flower_color`|varchar(255)|Indice colore fiori|
|`pot_color`|varchar(255)|Indice colore vaso|
|`created_at`|timestamp||
|`updated_at`|timestamp||

### `devices`

Associa un dispositivo fisico ESP8266 a una pianta. Un dispositivo è identificato da un token univoco hardcodato nel firmware.

|Colonna|Tipo|Note|
|---|---|---|
|`device_id`|bigint unsigned|Chiave primaria|
|`plant_id`|bigint unsigned|FK → `plants`, nullable|
|`device_token`|varchar(255)|Unico, corrisponde a `DEVICE_TOKEN` nel firmware|
|`last_seen_at`|timestamp|Aggiornato a ogni messaggio ricevuto, nullable|
|`created_at`|timestamp||
|`updated_at`|timestamp||

### `sensor_readings`

Ogni lettura periodica inviata dal dispositivo viene salvata qui. Non ha timestamps di Laravel perché `recorded_at` sostituisce `created_at`.

|Colonna|Tipo|Note|
|---|---|---|
|`reading_id`|bigint unsigned|Chiave primaria|
|`plant_id`|bigint unsigned|FK → `plants`|
|`humidity`|double|Umidità aria (%)|
|`temperature`|double|Temperatura (°C)|
|`soil_humidity`|double|Umidità suolo (%)|
|`luminosity`|double|Luminosità (lx), nullable|
|`recorded_at`|timestamp|Orario della lettura|

### `watering_events`

Registra ogni annaffiatura, distinguendo se è avvenuta tramite il bottone fisico, manualmente dall'app o (in futuro) in modo automatico.

|Colonna|Tipo|Note|
|---|---|---|
|`watering_id`|bigint unsigned|Chiave primaria|
|`plant_id`|bigint unsigned|FK → `plants`|
|`watered_at`|timestamp|Orario dell'annaffiatura|
|`source`|enum|`button`, `manual_app`, `scheduled`|
