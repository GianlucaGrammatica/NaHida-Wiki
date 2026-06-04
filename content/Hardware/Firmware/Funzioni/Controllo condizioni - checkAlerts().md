### `checkAlerts()`
Funzione del firmware • [[Codice Sorgente - Firmware]] - [[Hardware e Firmware ESP]]

```cpp
void checkAlerts() {
    if (millis() - lastAlertCheck < 300000) return;
    lastAlertCheck = millis();
    if (currentConfig.name == "Waiting...") return;

    bool fuoriRange =
        currentReadings.temperature < currentConfig.tempMin    ||
        currentReadings.temperature > currentConfig.tempMax    ||
        currentReadings.humidity    < currentConfig.humMin     ||
        currentReadings.humidity    > currentConfig.humMax     ||
        currentReadings.soilHum     < currentConfig.soilHumMin ||
        currentReadings.soilHum     > currentConfig.soilHumMax ||
        currentReadings.luminosity  < currentConfig.luxMin     ||
        currentReadings.luminosity  > currentConfig.luxMax;

    if (fuoriRange) playSound(SND_ALERT);
}
```

L'allarme è puramente locale: viene emesso solo il suono, nessun messaggio MQTT aggiuntivo. Il server riceve già le letture ogni 10 secondi e può rilevare le anomalie autonomamente dai dati salvati.

Il check viene saltato se il nome è ancora `"Waiting..."`, indicando che la configurazione non è ancora arrivata dal server. In questo caso usare i range di default (0-100%) produrrebbe sempre un risultato "tutto ok", quindi l'allarme non avrebbe senso.
