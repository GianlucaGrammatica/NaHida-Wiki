# 🌿 NaHida • Smart Plant Monitor

> **Progetto IoT per il monitoraggio intelligente delle piante, sviluppato da Colombara e Grammatica.**  

---
![[NaHida_Logo.png]]
## Cos'è NaHida
NaHida è un sistema di monitoraggio intelligente per piante d'appartamento. Un dispositivo **ESP8266** legge i sensori ambientali e li trasmette via **MQTT** a un server **Laravel**, che li salva nel database e li mostra in tempo reale su una **PWA** con personaggio Live2D interattivo.

---

## Stack tecnologico

| Layer            | Tecnologia                                 |
| ---------------- | ------------------------------------------ |
| Microcontrollore | ESP8266 + PlatformIO                       |
| Broker MQTT      | HiveMQ Cloud (TLS, porta 8883)             |
| Backend          | Laravel 11 + PHP                           |
| WebSocket        | Laravel Reverb                             |
| Frontend         | Blade + Alpine.js + DaisyUI + Tailwind CSS |
| Database         | MySQL                                      |
| Modello 2D       | Live2D Cubism SDK (pixi-live2d-display)    |

---
## Indice
- [[Overview del progetto]]
- [[Funzionalità e flusso]]
- [[Database]]
- [[Web App]]
- [[Hardware e Firmware ESP]]
- [[Modello Live2D]]
## Link Utili
- [Repositoy Web App](https://github.com/arco2121/NaHida)
- [Repository Framework ESP](https://github.com/GianlucaGrammatica/NaHida-ESP-Config)
- [Demo Video](https://www.youtube.com/watch?v=0ceM744z58M)
- [Web App Online](https://nahida-0dsp.onrender.com/)