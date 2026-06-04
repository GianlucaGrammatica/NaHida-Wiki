---
title: Presentazione
---
---

# 🌿 NaHida

### Smart Plant Monitor

Sistema IoT per il monitoraggio delle piante

Gianluca Grammatica · Marco Colombara Esame di Stato · A.S. 2025/2026

![[NaHida_Picture_1.jpg]]

---
## L'obbiettivo

Le piante da appartamento muoiono spesso per cure sbagliate: troppa o troppa poca acqua, luce non adatta, e ce ne si accorge quando è tardi. NaHida misura le condizioni della pianta e avvisa quando escono dai valori giusti.

- Un dispositivo legge temperatura, umidità dell'aria, umidità del terreno e luce
- I dati arrivano in tempo reale a una web app
- Per ogni pianta l'utente imposta i valori ottimali e riceve un segnale quando qualcosa è fuori range
- Un avatar della pianta mostra lo stato in modo immediato

Approfondisci: [Overview del progetto](https://gianlucagrammatica.github.io/NaHida-Wiki/Overview/Overview-del-progetto), [Funzionalità e flusso](https://gianlucagrammatica.github.io/NaHida-Wiki/Overview/Funzionalit%C3%A0-e-flusso)

---
## Architettura del sistema

Il dato parte dal sensore fisico e arriva al browser passando per quattro componenti:

**ESP8266 → HiveMQ (MQTT) → Laravel → Reverb (WebSocket) → Browser**

|Layer|Tecnologia|
|---|---|
|Microcontrollore|ESP8266 + PlatformIO|
|Broker MQTT|HiveMQ Cloud (TLS)|
|Backend|Laravel 12 + PHP|
|Real-time|Laravel Reverb|
|Frontend|Blade + Alpine + DaisyUI + Tailwind|
|Database|MySQL (locale) · PostgreSQL/Supabase (produzione)|
|Avatar|Live2D Cubism|
|Deploy|Render (Docker)|

![[NaHida_Architettura.png]]

Approfondisci: [Funzionalità e flusso](https://gianlucagrammatica.github.io/NaHida-Wiki/Overview/Funzionalit%C3%A0-e-flusso)

---
## Hardware: il dispositivo

Il sistema ruota intorno a un **ESP8266 (NodeMCU)**, scelto per il WiFi integrato e il numero di pin sufficiente per tutti i moduli.

- **DHT11**: temperatura e umidità dell'aria
- **Sensore capacitivo**: umidità del terreno; rispetto ai sensori resistivi non si corrode a contatto con la terra
- **BH1750**: luminosità, sul bus I2C condiviso con il display
- **Display OLED 128x64**: mostra nome e stato senza bisogno di aprire l'app
- **DFPlayer Mini + speaker**: riproduce suoni e musica; il segnale dall'ESP viene adattato con un transistor BC547
- **Pulsante** per registrare l'annaffiatura, **due LED** (verde e rosso) per lo stato

![[NaHida_Picture_2.jpg]]

Approfondisci: [Hardware e Firmware ESP](https://gianlucagrammatica.github.io/NaHida-Wiki/Hardware/Hardware-e-Firmware-ESP)

---
## Firmware: come funziona il dispositivo

Scritto in **C++** con il framework Arduino. Il `loop()` è non bloccante e gestisce più operazioni a tempi diversi.

- **Ogni 10 secondi** legge i sensori e pubblica i valori in formato JSON via MQTT
- **Ogni 5 minuti**, se i valori sono fuori range, emette un allarme sonoro
- Il **LED verde** si accende quando il dispositivo è online e i parametri sono a posto, il **rosso** quando è offline o un valore è fuori soglia
- L'ultima configurazione viene salvata in **EEPROM** con un _magic number_ (`0xAB`): così il dispositivo funziona anche offline, applicando i valori noti prima ancora di sentire il server

Approfondisci: [Hardware e Firmware ESP](https://gianlucagrammatica.github.io/NaHida-Wiki/Hardware/Hardware-e-Firmware-ESP), [Codice Sorgente Firmware](https://gianlucagrammatica.github.io/NaHida-Wiki/Hardware/Firmware/Codice-Sorgente---Firmware)

---
## Comunicazione MQTT

Il dispositivo e il server comunicano tramite il broker **HiveMQ Cloud** su connessione **TLS**. Ogni dispositivo ha un **token univoco** che ne è l'identità.

- `device/{token}/updates`: il dispositivo invia telemetria e annaffiature, il server invia il comando per la musica
- `device/{token}/config`: il server invia la configurazione ottimale (messaggio _retained_, resta disponibile per il device che si riconnette)
- `device/{token}/status`: il dispositivo invia il segnale di vita `ONLINE`

Approfondisci: [Laravel: ESP verso server](https://gianlucagrammatica.github.io/NaHida-Wiki/Software/Codice-Sorgente/BackEnd/Laravel-ESP-verso-server), [Laravel: server verso ESP](https://gianlucagrammatica.github.io/NaHida-Wiki/Software/Codice-Sorgente/BackEnd/Laravel-server-verso-ESP)

---
## Backend Laravel: ricezione dei dati

Un comando Artisan, **`MqttListener`**, resta in ascolto sul broker e smista i messaggi in arrivo.

- Sottoscrive i topic `updates` e `status` di tutti i dispositivi
- Riconosce il dispositivo dal token e scarta i messaggi da token non registrati
- Una lettura dei sensori viene salvata come `SensorReading` e fa partire l'evento `SensorUpdated`
- Un `BUTTON_PRESSED` crea un `WateringEvent` e fa partire l'evento `ButtonPressed`
- A ogni messaggio aggiorna `last_seen_at`, da cui si ricava se il dispositivo è online

Approfondisci: [Laravel: ESP verso server](https://gianlucagrammatica.github.io/NaHida-Wiki/Software/Codice-Sorgente/BackEnd/Laravel-ESP-verso-server), [Modelli Eloquent](https://gianlucagrammatica.github.io/NaHida-Wiki/Software/Codice-Sorgente/BackEnd/Laravel-Modelli-Eloquent)

---
## Aggiornamenti in tempo reale

Per aggiornare la pagina senza ricaricarla si usa **Laravel Reverb**, il server WebSocket.

- Gli eventi `SensorUpdated` e `ButtonPressed` vengono trasmessi sul canale `plant.{id}`
- Il browser li riceve con **Laravel Echo**
- Se il WebSocket non riceve nulla per 20 secondi, parte un polling AJAX ogni 15 secondi come riserva, così i dati restano aggiornati anche se la connessione cade

Approfondisci: [Laravel: pipeline realtime frontend](https://gianlucagrammatica.github.io/NaHida-Wiki/Software/Codice-Sorgente/FrontEnd/Laravel-pipeline-realtime-frontend)

---

## Frontend: l'interfaccia

Costruito con **Blade** e **Alpine.js**, con lo stile gestito da **DaisyUI** e **Tailwind**.

- Tema chiaro e scuro
- Grafici dei sensori con **Chart.js**, con i limiti ottimali disegnati come linee tratteggiate
- Card delle piante con lo stato di salute a colpo d'occhio
- Effetti sonori sull'interfaccia e suoni diversi a seconda dell'umore della pianta

![[NaHida_Picture_3.jpg]]

Approfondisci: [Infrastruttura frontend](https://gianlucagrammatica.github.io/NaHida-Wiki/Software/Codice-Sorgente/FrontEnd/Laravel-infrastruttura-frontend), [Dashboard Controller](https://gianlucagrammatica.github.io/NaHida-Wiki/Software/Codice-Sorgente/FrontEnd/Laravel-Dashboard-Controller)

---
## Il modello Live2D

Un avatar animato della pianta che reagisce ai dati reali dei sensori.

- **Quattro stati**: normale, attenzione, triste, addormentata
- Lo stato dipende da quanti sensori sono fuori range e dal livello di luce
- L'avatar reagisce al tocco, segue il mouse, sbatte le palpebre e chiude gli occhi mentre si scrive la password
- L'aspetto è personalizzabile: variante della pianta, colore della pianta, del fiore e del vaso
- Uno scatto del modello viene salvato come immagine e riutilizzato nelle card delle piante

![[NaHida_Picture_4.png]]

Approfondisci: [Modello Live2D](https://gianlucagrammatica.github.io/NaHida-Wiki/Software/Modello-Live2D), [Live2D Plant Viewer](https://gianlucagrammatica.github.io/NaHida-Wiki/Software/Codice-Sorgente/Live2d-plant-viewer)

---
## Sicurezza

Le scelte di sicurezza sono distribuite su tutto il sistema.

- **Password** salvate con hash bcrypt automatico
- **Login** con limite di 5 tentativi per la stessa coppia email e IP
- **Token CSRF** su ogni chiamata AJAX
- Ogni query filtra per `user_id`: chi prova ad aprire una pianta non sua riceve un 404, che non rivela nemmeno se quella pianta esiste
- Il dispositivo è identificato dal token e la connessione MQTT è cifrata in TLS
- Tutti gli input vengono validati sul server prima di toccare database o MQTT

Approfondisci: [Sicurezza](https://gianlucagrammatica.github.io/NaHida-Wiki/Software/Codice-Sorgente/Sicurezza)

---
## Database

Cinque tabelle principali, con chiavi primarie personalizzate e foreign key.

- `users`: gli account
- `plants`: le piante, con condizioni ottimali e aspetto
- `devices`: i dispositivi e i loro token
- `sensor_readings`: lo storico delle letture
- `watering_events`: lo storico delle annaffiature (bottone, app o automatica)

Quando un utente viene eliminato, le sue piante e tutti i dati collegati vengono eliminati a cascata.

Approfondisci: [Database](https://gianlucagrammatica.github.io/NaHida-Wiki/Software/Database), [Modelli Eloquent](https://gianlucagrammatica.github.io/NaHida-Wiki/Software/Codice-Sorgente/BackEnd/Laravel-Modelli-Eloquent)

---
## Deploy

In sviluppo il progetto gira in locale con **XAMPP** e **MySQL**, e con **Vite** per il frontend.

In produzione è ospitato su **Render** con una build **Docker**, e usa **Supabase** come database **PostgreSQL**. L'app è online e raggiungibile da qualsiasi browser.

Approfondisci: [Deploy e Dockerfile](https://gianlucagrammatica.github.io/NaHida-Wiki/Software/Codice-Sorgente/Deploy-dockerfile)

---
## Demo

- **Web app**: [nahida-0dsp.onrender.com](https://nahida-0dsp.onrender.com/)
- **Repository**: [github.com/arco2121/NaHida](https://github.com/arco2121/NaHida)
- **Video**: [YouTube](https://www.youtube.com/watch?v=0ceM744z58M)

---

## Sviluppi futuri

- **Annaffiatura automatica** con una pompa: la fonte `scheduled` è già prevista nel database
- **Notifiche** o un'app mobile dedicata

---

## Grazie

🌿 **NaHida** · Gianluca Grammatica · Marco Colombara