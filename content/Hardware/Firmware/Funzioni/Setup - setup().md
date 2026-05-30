### `setup()`
Funzione del firmware • [[Codice Sorgente]] - [[Hardware e Firmware ESP]]

```cpp
void setup() {
    Serial.begin(115200);
    delay(100);
    Serial.println("BOOT");
    Serial.println(ESP.getResetReason());

    pinMode(LED_PIN, OUTPUT);     digitalWrite(LED_PIN, LOW);
    pinMode(LED_RED_PIN, OUTPUT); digitalWrite(LED_RED_PIN, HIGH);
    pinMode(BTN_PIN, INPUT_PULLUP);

    dht.begin();
    Wire.begin();
    lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);
    if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        Serial.println("SSD1306 non trovato");
        while (true) { yield(); }
    }

    display.clearDisplay();
    display.display();
    showSplash();

    loadConfig();

    dfSerial.begin(9600);
    delay(1000);
    if (dfPlayer.begin(dfSerial, false, false)) {
        dfReady = true;
        dfPlayer.volume(18);
        playSound(SND_AVVIO);
    } else {
        Serial.println("DFPlayer non trovato");
    }

    espClient.setInsecure();
    WiFi.persistent(false);
    WiFi.setAutoReconnect(true);
    setupWiFi();

    mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
    mqttClient.setKeepAlive(60);
    mqttClient.setCallback(mqttCallback);
}
```

`LED_RED_PIN` viene inizializzato `HIGH` (spento, logica invertita). Se lo si inizializzasse `LOW` il LED rosso si accenderebbe per un frame prima che `updateLED()` lo gestisca.

`loadConfig()` è chiamato prima di `setupWiFi()`: il dispositivo parte già con i range ottimali dall'EEPROM, così il monitoraggio locale e gli allarmi sono attivi immediatamente anche se la rete non è disponibile.

`espClient.setInsecure()` disabilita la verifica del certificato TLS. La connessione al broker HiveMQ è comunque cifrata, ma il certificato non viene validato. È una scelta pragmatica dovuta ai limiti di memoria dell'ESP8266 per gestire i certificati CA.

`WiFi.persistent(false)` evita che le credenziali WiFi vengano riscritte nella flash ad ogni connessione, riducendo l'usura della memoria.

`dfPlayer.begin(dfSerial, false, false)`: i due `false` disabilitano il reset hardware e l'attesa dell'ACK, rendendo l'inizializzazione più veloce e meno soggetta a timeout su hardware che risponde lentamente.