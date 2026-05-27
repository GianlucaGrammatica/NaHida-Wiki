## Obbiettivi
L'obbiettivo era creare un device da posizionare vicino al vaso di una pianta per di monitorarne lo stato e registrare quando la si annaffia. Il tutto gestito tramite una web app interattva.

- Dispositivo che legge i tre sensori e mostra i valori a schermo con anche un rapido indicatore di stato
- Bottone per registrare quando si annaffia
- Dispositivo connesso al WiFi che invia i dati dei sensori al server via MQTT
- Server che riceve i dati tramite MQTT e li salva nel database
- Web app che permette la gestione delle piante e il monitoraggio dello stato
- L’utente può registrarsi, fare il login, aggiungere una pianta e vedere i dati in tempo reale
- Permettere all'utente di personalizzare l'avatar della sua pianta con cui può interagire all'interno dell'app
## Requisiti Hardware

| Componente                           | Descrizione                                    |
| ------------------------------------ | ---------------------------------------------- |
| ESP8266 (NodeMCU)                    | Microcontrollore con WiFi integrato            |
| DHT11                                | Sensore di temperatura e umidità dell'aria     |
| Capacitive Soil Moisture Sensor v1.2 | Sensore capacitivo per l'umidità del terreno   |
| BH1750                               | Sensore di luminosità                          |
| Display OLED 128x64 IIC              | Schermo per visualizzare nome e stato          |
| DFPlayer Mini (MP3 TF-16P)           | Modulo per la riproduzione audio               |
| Speaker 0.5W 8Ω                      | Altoparlante                                   |
| Scheda SD FAT32                      | Memoria per i file audio del DFPlayer          |
| Transistor BC547                     | Gestione del segnale invertito per il DFPlayer |
| Pulsante momentaneo                  | Bottone per registrare l'annaffiatura          |
| LED verde + LED rosso                | Indicatori visivi di stato                     |
| Resistenze e cavetti                 | Componentistica di supporto                    |


---
## Task e divisione lavoro

| Area                                     | Responsabile     |
| ---------------------------------------- | ---------------- |
| Hardware e configurazione ESP8266        | Gianluca         |
| Comunicazione MQTT (ESP ↔ Server)        | Gianluca + Marco |
| Creazione Database                       | Gianluca         |
| Backend per la Web App                   | Marco            |
| Frontend della Web App                   | Marco + Gianluca |
| Modello Live2D e integrazione Cubism SDK | Gianluca         |

---
## Repository
Il progetto è condiviso via **Git**. I branch principali seguono le aree di lavoro; i merge vengono fatti sul branch `main` dopo test locali.
### Hosting su Render
Il progetto utilizza l'hosting gratuito di Render e SupaBase
La web app è disponibile a [questo url](https://nahida-0dsp.onrender.com/)
