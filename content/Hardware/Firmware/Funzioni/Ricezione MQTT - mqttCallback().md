### `mqttCallback()`
Funzione del firmware • [[Codice Sorgente - Firmware]] - [[Hardware e Firmware ESP]]

```cpp
void mqttCallback(char* topic, const byte* payload, unsigned int length) {
    String message = "";
    for (unsigned int i = 0; i < length; i++) message += static_cast<char>(payload[i]);
    String topicStr = String(topic);

    if (topicStr == String("device/") + DEVICE_TOKEN + "/config") {
        JsonDocument doc;
        if (!deserializeJson(doc, message)) {
            currentConfig.name       = doc["plant_name"].as<String>();
            currentConfig.humMin     = doc["hum_min"]      | 0.0f;
            currentConfig.humMax     = doc["hum_max"]      | 100.0f;
            currentConfig.tempMin    = doc["temp_min"]     | 0.0f;
            currentConfig.tempMax    = doc["temp_max"]     | 50.0f;
            currentConfig.soilHumMin = doc["soil_hum_min"] | 0.0f;
            currentConfig.soilHumMax = doc["soil_hum_max"] | 100.0f;
            currentConfig.luxMin     = doc["lux_min"]      | 0.0f;
            currentConfig.luxMax     = doc["lux_max"]      | 100000.0f;
            saveConfig();
            updateOLED(mqttClient.connected());
        }
    }

    if (topicStr == String("device/") + DEVICE_TOKEN + "/updates") {
        JsonDocument command;
        if (!deserializeJson(command, message)) {
            if (command["command"] == String("PLAY_MUSIC")) {
                int source = String(command["source"]).toInt();
                playSound(source);
            }
        }
    }
}
```

PubSubClient passa il payload come `byte*` con lunghezza esplicita e senza terminatore nullo. Il ciclo `for` ricostruisce la stringa manualmente carattere per carattere.

La sintassi `doc["chiave"] | valore_default` è un operatore di ArduinoJson: se il campo è assente o nullo, viene usato il valore di default senza bisogno di controlli espliciti per ogni campo.

Il topic `/updates` è bidirezionale: l'ESP pubblica su di esso i dati telemetrici e gli eventi bottone, e il server pubblica su questo stesso topic i comandi operativi come `PLAY_MUSIC`. Il callback distingue in base al contenuto: se il JSON ha un campo `command` è un comando in arrivo, altrimenti il messaggio non viene interpretato. I messaggi plain text come `"BUTTON_PRESSED"` vengono invece pubblicati dall'ESP stesso, non ricevuti.

Dopo aver ricevuto una configurazione valida, `saveConfig()` persiste i nuovi range in EEPROM e `updateOLED()` aggiorna subito il display con il nome della pianta ricevuto.
