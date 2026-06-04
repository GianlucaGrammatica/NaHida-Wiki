# Firmware: Codice Sorgente

> Per lo schema circuitale, le scelte hardware e la descrizione comportamentale del dispositivo, vedi [[Hardware e Firmware ESP]]. Questa pagina documenta il sorgente `main.cpp`: struttura globale, variabili, loop principale e dettaglio di ogni funzione con le relative scelte implementative.

---
## Struttura del file
`main.cpp` è organizzato in sezioni marcate da commenti (`// ===...`):
1. Include e dipendenze
2. Costanti (`#define`)
3. Oggetti globali (periferiche, client MQTT/WiFi)
4. Strutture dati (`PlantConfig`, `SensorReadings`)
5. Variabili di stato e timer
6. Funzioni (EEPROM, Audio, LED, Display, WiFi, MQTT, Bottone, Sensori, Alert)
7. `setup()`
8. `loop()`
Le funzioni sono definite prima di `setup()` così non servono forward declarations.
## Indice delle funzioni
- [[Setup - setup()]]
- [[Memoria - saveConfig() e loadConfig()]]
- [[WiFi - setupWiFi()]]
- [[Connesione MQTT - connectMQTT()]]
- [[Ricezione MQTT - mqttCallback()]]
- [[Lettura sensori - readSensors()]]
- [[Invio dati - publishTelemetry()]]
- [[Controllo condizioni - checkAlerts()]]
- [[Gestione LED - updateLED()]]
- [[Gestione display - updateOLED() e showSplash()]]
- [[Gestione bottone - handleButton() e showButtonFeedback()]]
- [[Suoni - playSound()]]

---
## Parti globali
### Include e librerie

```cpp
#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <BH1750.h>
#include <SoftwareSerial.h>
#include <DFRobotDFPlayerMini.h>
#include <EEPROM.h>
#include "config.h"
```

`config.h` è un file locale che contiene le credenziali (`WIFI_SSID`, `WIFI_PASS`, `MQTT_SERVER`, `MQTT_USER`, `MQTT_PASS`, `DEVICE_TOKEN`). Separa i segreti dal codice sorgente tracciato da Git.

---
### Costanti

```cpp
#define LED_PIN      D0   // verde: online e sensori ok
#define LED_RED_PIN  D3   // rosso: logica invertita, LOW = acceso
#define BTN_PIN      D4
#define DHT_PIN      D5
#define DHT_TYPE     DHT11
#define SOIL_PIN     A0
#define SOIL_DRY     770  // valore ADC a terreno secco
#define SOIL_WET     260  // valore ADC a terreno bagnato
#define DF_RX        D6
#define DF_TX        D7
#define PUSH_TIMEOUT 10000

#define EEPROM_SIZE  256
#define EEPROM_MAGIC 0xAB
```

`SOIL_DRY` e `SOIL_WET` sono valori di calibrazione empirici. Il sensore capacitivo legge circa 770 ad aria asciutta e circa 260 immerso: i valori sono invertiti rispetto all'intuizione perché la capacità aumenta con l'umidità, abbassando la tensione letta dall'ADC.

`LED_RED_PIN D3` usa logica invertita perché il LED rosso è collegato con la resistenza verso VCC (non verso GND). `LOW` lo accende, `HIGH` lo spegne.

Le tracce audio sono definite come costanti per evitare magic numbers sparsi nel codice:

```cpp
#define SND_CONNESSO          1
#define SND_ACQUA             2
#define SND_ALERT             3
#define SND_INTERAZIONE_LUNGO 4
#define SND_AVVIO             5
#define SND_DISCONNESSO       11
```

Il layout EEPROM è documentato nei commenti del sorgente e mappato manualmente byte per byte:

```
// 0        uint8_t  magic
// 1..32    char[32] plant name
// 33       float    humMin      (4 byte)
// 37       float    humMax
// 41       float    tempMin
// 45       float    tempMax
// 49       float    soilHumMin
// 53       float    soilHumMax
// 57       float    luxMin
// 61       float    luxMax
```

La mappatura manuale (invece di serializzare direttamente la struct) rende il layout stabile anche se la struct viene modificata in futuro: un campo aggiunto alla struct non sposta i dati già salvati.

---
### Strutture dati

```cpp
struct PlantConfig {
    String name      = "Waiting...";
    float humMin     = 0,   humMax     = 100;
    float tempMin    = 0,   tempMax    = 50;
    float soilHumMin = 0,   soilHumMax = 100;
    float luxMin     = 0,   luxMax     = 100000;
};

struct SensorReadings {
    float humidity    = 0;
    float temperature = 0;
    float soilHum     = 0;
    float luminosity  = 0;
};

PlantConfig currentConfig;
SensorReadings currentReadings;
```

I valori di default di `PlantConfig` corrispondono al range "tutto ok" (0-100% per umidità e suolo, 0-50°C per temperatura), così `checkAlerts()` e `updateLED()` non generano falsi allarmi prima che il server invii la configurazione reale.

Il nome `"Waiting..."` funziona da flag sentinella: alcune funzioni lo usano per capire se la configurazione è già stata ricevuta dal server.

---
### Oggetti globali

```cpp
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);
DHT dht(DHT_PIN, DHT_TYPE);
BH1750 lightMeter;
SoftwareSerial dfSerial(DF_RX, DF_TX, true);
DFRobotDFPlayerMini dfPlayer;
```

Il terzo argomento `true` di `SoftwareSerial` abilita la logica invertita, necessaria per il circuito con transistor BC547 sulla linea TX (vedi [[Hardware e Firmware ESP]] per lo schema).

---
### Variabili di stato e timer

```cpp
unsigned long lastSensorPublish = 0;
unsigned long lastDisplayUpdate = 0;
unsigned long lastDebounceTime  = 0;
unsigned long lastAlertCheck    = 0;
unsigned long lastMqttAttempt   = 0;
unsigned long lastSensorRead    = 0;
bool lastButtonState = HIGH;
bool wasConnected    = false;

bool dfReady = false;
unsigned long feedbackUntil = 0;
```

Tutte le attività periodiche usano il pattern `millis() - lastX < intervallo` al posto di `delay()`, così il `loop()` non si blocca mai.

`feedbackUntil` è il timestamp fino al quale mostrare il messaggio di conferma sul display dopo la pressione del bottone.

`wasConnected` serve a rilevare i cambi di stato MQTT per triggerare i suoni di connessione e disconnessione esattamente una volta per evento.

---
## `loop()` - ciclo principale

```cpp
void loop() {
    connectMQTT();
    mqttClient.loop();

    handleButton();

    if (millis() - lastSensorRead >= 2000) {
        lastSensorRead = millis();
        readSensors();
    }

    publishTelemetry();
    checkAlerts();
    updateLED();

    if (feedbackUntil == 0 && millis() - lastDisplayUpdate > 2000) {
        lastDisplayUpdate = millis();
        updateOLED(mqttClient.connected());
    }
    if (feedbackUntil != 0 && millis() > feedbackUntil) {
        feedbackUntil = 0;
        lastDisplayUpdate = millis();
        updateOLED(mqttClient.connected());
    }

    while (dfSerial.available() > 0) {
        dfSerial.read();
    }
}
```

L'approccio non bloccante permette di gestire più attività con frequenze diverse in un singolo thread senza mai usare `delay()`:

| Attività                              | Frequenza effettiva                             |
| ------------------------------------- | ----------------------------------------------- |
| `connectMQTT()` + `mqttClient.loop()` | ogni iterazione                                 |
| `handleButton()`                      | ogni iterazione                                 |
| `readSensors()`                       | ogni 2s                                         |
| `publishTelemetry()`                  | ogni 10s (timer interno)                        |
| `checkAlerts()`                       | ogni 5 minuti (timer interno)                   |
| `updateLED()`                         | ogni iterazione                                 |
| `updateOLED()`                        | ogni 2s oppure alla scadenza di `feedbackUntil` |

Il display ha due modalità: aggiornamento normale ogni 2s quando `feedbackUntil == 0`, e ripristino automatico quando il tempo di feedback scade. La pulizia del buffer `dfSerial` in fondo previene l'accumulo dei messaggi di status del DFPlayer che altrimenti bloccherebbero `SoftwareSerial`.