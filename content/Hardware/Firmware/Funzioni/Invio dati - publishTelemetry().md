### `publishTelemetry()`
Funzione del firmware • [[Codice Sorgente - Firmware]] - [[Hardware e Firmware ESP]]

```cpp
void publishTelemetry() {
    if (millis() - lastSensorPublish < PUSH_TIMEOUT) return;
    lastSensorPublish = millis();

    JsonDocument doc;
    doc["type"] = "sensor_data";
    doc["humidity"]      = round(currentReadings.humidity      * 10) / 10.0;
    doc["temperature"]   = round(currentReadings.temperature   * 10) / 10.0;
    doc["soil_humidity"] = round(currentReadings.soilHum       * 10) / 10.0;
    doc["luminosity"]    = round(currentReadings.luminosity    * 10) / 10.0;

    String payload;
    serializeJson(doc, payload);
    mqttClient.publish(
        (String("device/") + DEVICE_TOKEN + "/updates").c_str(),
        payload.c_str()
    );
}
```

Il campo `type: "sensor_data"` permette al `MqttListener` Laravel di distinguere questo payload JSON dal messaggio plain `"BUTTON_PRESSED"` che transita sullo stesso topic. Vedi [[MqttListener]].

I valori vengono arrotondati a una cifra decimale prima della serializzazione con `round(x * 10) / 10.0`. Riduce il rumore nei dati salvati nel database e nei grafici senza perdere precisione significativa per i sensori usati.