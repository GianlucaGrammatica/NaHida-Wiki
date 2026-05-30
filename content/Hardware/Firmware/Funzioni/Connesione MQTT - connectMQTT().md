### `connectMQTT()`
Funzione del firmware • [[Codice Sorgente - Firmware]] - [[Hardware e Firmware ESP]]

```cpp
void connectMQTT() {
    if (mqttClient.connected()) return;
    if (millis() - lastMqttAttempt < 5000) return;
    lastMqttAttempt = millis();

    String clientId = String("ESP-") + DEVICE_TOKEN;
    if (mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
        mqttClient.subscribe((String("device/") + DEVICE_TOKEN).c_str(), 1);
        mqttClient.subscribe((String("device/") + DEVICE_TOKEN + "/config").c_str(), 1);
        mqttClient.subscribe((String("device/") + DEVICE_TOKEN + "/updates").c_str(), 1);
        mqttClient.publish((String("device/") + DEVICE_TOKEN + "/status").c_str(), "ONLINE");
    } else {
        Serial.print("MQTT fallito, rc=");
        Serial.println(mqttClient.state());
    }
}
```

`connectMQTT()` viene chiamata ad ogni iterazione del loop ma cortocircuita subito se è già connessa o se sono passati meno di 5 secondi dall'ultimo tentativo fallito. Questo evita di saturare il loop con tentativi di riconnessione troppo frequenti.

Il `clientId` usa `DEVICE_TOKEN` come suffisso: nel pannello HiveMQ Cloud ogni dispositivo è identificabile per nome invece di avere un ID casuale.

Le subscription usano QoS 1 (secondo argomento di `subscribe`): garantisce che il broker reconsegni il messaggio almeno una volta in caso di disconnessione temporanea. In particolare, `retain=true` viene impostato dal server sul topic `/config` (vedi [[DeviceController]]), così l'ultimo messaggio di configurazione viene riconsegnato automaticamente a ogni riconnessione senza che il server debba ripubblicarlo.

Dopo la connessione viene pubblicato `"ONLINE"` sul topic `/status`: il `MqttListener` Laravel lo riceve e aggiorna `last_seen_at` nel database.
