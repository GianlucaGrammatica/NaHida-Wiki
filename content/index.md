# 🌿 NaHida • Smart Plant Monitor

> Progetto IoT per il monitoraggio intelligente delle piante, sviluppato da Colombara e Grammatica.

---

## Stack tecnologico

| Layer | Tecnologia |
|---|---|
| Microcontrollore | ESP8266 + PlatformIO |
| Broker MQTT | HiveMQ Cloud (TLS, porta 8883) |
| Backend | Laravel 12 + PHP |
| WebSocket | Laravel Reverb |
| Frontend | Blade + Alpine.js + DaisyUI + Tailwind CSS |
| Database | MySQL (Supabase) |
| Modello 2D | Live2D Cubism SDK (pixi-live2d-display) |
| Deploy | Render (Docker) |

---

## Indice generale

### Panoramica
- [[Overview del progetto]]: obiettivi, requisiti hardware, divisione del lavoro
- [[Funzionalità e flusso]]: flusso del dispositivo e flusso della web app pagina per pagina
- [[Database]]: schema delle tabelle con colonne e chiavi

### Hardware e Firmware
- [[Hardware e Firmware ESP]]: schema circuitale, pinout, componentistica e descrizione comportamentale
- [[Codice Sorgente - Firmware]]: parti globali, loop e tutte le funzioni con codice e note implementative

### Backend Laravel

**Flusso dei dati ESP → Server → Browser**
- [[Laravel ESP verso server]]: MqttListener, eventi SensorUpdated e ButtonPressed, ricezione Echo lato frontend
- [[Laravel server verso ESP]]: DeviceController: sendConfig, sendMusic, toggleLed, linkDevice, unlinkDevice

**Controller**
- [[Laravel plants controller]]: index, show, store, update (PATCH), water, history, latestReading
- [[Laravel Dashboard Controller]]: query piante fuori range, prossime annaffiature, attività recente

**Fondamenta**
- [[Laravel Modelli Eloquent]]: chiavi primarie custom, cast, relazioni, hook booted()
- [[Laravel infrastruttura frontend]]: renderPage(), bridge.js, echo.js, sistema temi, sound manager

### Frontend
- [[Laravel pipeline realtime frontend]]: calcHealth(), Echo + polling fallback, grafici live Chart.js, snapshot aspetto
- [[Live2d plant viewer]]: Singleton IIFE, tick loop, parametri Cubism, setState, capturePreview

### Modello Live2D
- [[Modello Live2D]] — cos'è Live2D, integrazione tecnica, stati e comportamenti

### Deploy e Sicurezza
- [[Deploy dockerfile]] — build multi-stage, concurrently, hosting Render + Supabase
- [[Sicurezza]] — bcrypt, rate limiting, CSRF, ownership risorse, TLS MQTT, validazione input

---

## Link utili
- [Repository Web App](https://github.com/arco2121/NaHida)
- [Repository Firmware ESP](https://github.com/GianlucaGrammatica/NaHida-ESP-Config)
- [Demo Video](https://www.youtube.com/watch?v=0ceM744z58M)
- [Web App Online](https://nahida-0dsp.onrender.com/)