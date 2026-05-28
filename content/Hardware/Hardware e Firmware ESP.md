![[NaHida_Picture_1.jpg]]
## Schema Circuitale e Assegnazione Pin
Data la complessità e la varietà dei moduli impiegati, lo schema elettrico è documentato tramite la seguente tabella di mappatura dei pin (Pinout) e la descrizione analitica dei collegamenti. Il sistema è basato su un microcontrollore ESP8266 (NodeMCU).

|**Pin ESP8266**|**Componente**|**Direzione**|**Dettagli di Collegamento e Logica**|
|---|---|---|---|
|**D0**|LED Verde|Output|Collegato in serie a una resistenza da 10Ω verso GND. Segnala lo stato online e parametri ottimali.|
|**D1**|Bus I2C (SCL)|In/Out|Condiviso tra Display OLED e sensore di luminosità BH1750.|
|**D2**|Bus I2C (SDA)|In/Out|Condiviso tra Display OLED e sensore di luminosità BH1750.|
|**D3**|LED Rosso|Output|Collegato a VCC tramite resistenza. Gestito in logica invertita (`LOW` = acceso). Segnala anomalie o disconnessioni.|
|**D4**|Pulsante (Annaffiatura)|Input|Collegato a GND, utilizza la resistenza di pull-up interna del microcontrollore (`INPUT_PULLUP`).|
|**D5**|DHT11|Input|Pin dati del sensore di temperatura e umidità dell'aria.|
|**D6**|DFPlayer TX|Input|Ricezione dati seriali dal modulo audio (collegato al pin TX del DFPlayer).|
|**D7**|DFPlayer RX|Output|Trasmissione dati verso il modulo audio. Il segnale passa attraverso una resistenza da 1kΩ, un transistor BC547 e una resistenza di pull-up da 10kΩ collegata a 5V.|
|**A0**|Capacitive Soil Moisture|Input|Lettura analogica del sensore di umidità del terreno.|
|**3V3**|Alimentazione Logica|Power|Alimenta DHT11, OLED, BH1750, sensore terreno e LED.|
|**VIN / 5V**|Alimentazione DFPlayer|Power|Alimenta il modulo audio DFPlayer Mini. I pin VCC del DFPlayer e la resistenza di pull-up del transistor sono collegati alla linea a 5V.|
|**GND**|Massa Comune|Power|Riferimento di massa comune per tutti i componenti del circuito.|

>**Nota sui collegamenti audio:** Il DFPlayer Mini pilota direttamente lo speaker da 0.5W 8Ω tramite i pin dedicati `SPK_1` (positivo) e `SPK_2` (negativo).
## Componentistica e Scelte Tecniche
L'infrastruttura hardware è stata selezionata per garantire affidabilità nella lettura dei dati e un'interazione utente immersiva:
- **ESP8266 (NodeMCU):** Microcontrollore principale scelto per il modulo WiFi integrato e l'adeguato numero di pin GPIO, ideale per progetti IoT a basso costo.
- **Sensore Capacitivo (Umidità Terreno):** Rispetto ai tradizionali sensori resistivi, la variante capacitiva previene il deterioramento per corrosione galvanica dei contatti immersi nel suolo, garantendo letture stabili nel tempo.
- **Modulo BH1750:** Sensore di luminosità ad alta precisione con interfaccia I2C. Viene configurato in modalità `CONTINUOUS_HIGH_RES_MODE` per letture ambientali affidabili anche con variazioni di luce minime.
- **DFPlayer Mini (MP3 TF-16P):** Modulo hardware dedicato alla decodifica e riproduzione di file audio da scheda SD.
    - _Adattamento Logico:_ Il microcontrollore opera a 3.3V, mentre il DFPlayer richiede segnali compatibili. L'utilizzo di un circuito con transistor BC547 sulla linea TX dell'ESP (D7) inverte e adatta il segnale logico. Di conseguenza, nel firmware viene istanziata una connessione `SoftwareSerial` con l'impostazione di logica invertita attivata (`true`).
- **Display OLED 128x64:** Permette la diagnostica visiva locale dello stato del dispositivo (connettività, lettura in tempo reale dei 4 parametri ambientali) senza la necessità di consultare l'applicativo web.

---
## Firmware
Il codice sviluppato per l'ESP8266, scritto in C++ tramite il framework Arduino, gestisce la sincronizzazione tra sensori locali e l'infrastruttura cloud tramite protocollo MQTT.
### Struttura di Avvio e Tolleranza ai Guasti (EEPROM)
Al primo avvio, o durante le successive accensioni, il dispositivo tenta la connessione alla rete WiFi specificata e al broker MQTT HiveMQ tramite connessione sicura (TLS).

Per garantire la continuità operativa in caso di assenza temporanea della rete, il firmware implementa un sistema di caricamento dei dati da EEPROM. Vengono riservati 64 byte per salvare il nome della pianta e i range minimi e massimi per i 4 sensori. Se la connessione al server ritarda, il sistema carica l'ultima configurazione nota validata da un _magic number_ (0xAB), permettendo al monitoraggio locale e agli allarmi (LED/Audio) di funzionare immediatamente offline.
### Ciclo Operativo (Telemetry e Alerts)
Il ciclo principale (`loop()`) è non bloccante ed esegue le seguenti routine temporizzate:
1. **Lettura e Pubblicazione:** 
   Ogni 10 secondi, interroga in sequenza il DHT11, l'ADC per l'umidità del suolo (con conversione calibrata in percentuale) e il BH1750. I dati vengono serializzati in formato JSON e pubblicati sul topic MQTT specifico del dispositivo (`device/{TOKEN}/updates`).
2. **Monitoraggio Allarmi:** 
   Ogni 5 minuti controlla se i valori correnti si discostano dai range ottimali salvati in memoria. Se si verifica un'anomalia, viene azionato un segnale acustico di allarme (`SND_ALERT`).
3. **Gestione Interfaccia:** 
   Il display OLED viene aggiornato con frequenza regolare per riflettere i dati attuali. La funzione `updateLED()` calcola in tempo reale lo stato logico accendendo il LED verde se la connessione è attiva e i parametri sono ideali, oppure commutando sul LED rosso in caso di offline o valori fuori soglia.
### Gestione Eventi e Sottoscrizioni MQTT
Il firmware si iscrive a due topic principali per la ricezione di dati dal server:
- `device/{TOKEN}/config`: 
  Riceve un payload JSON dal server contenente l'aggiornamento dei parametri ottimali. Il firmware decodifica il messaggio, aggiorna la struttura dati in RAM e persiste immediatamente i nuovi valori nella EEPROM.
- `device/{TOKEN}/updates`: 
  Topic utilizzato per l'invio bidirezionale. Il dispositivo pubblica qui i dati telemetrici e l'evento di annaffiatura manuale (attivato tramite debounce software sul pulsante fisico). Dal server riceve comandi operativi, come l'istruzione per avviare la riproduzione di specifiche tracce audio (`PLAY_MUSIC`).