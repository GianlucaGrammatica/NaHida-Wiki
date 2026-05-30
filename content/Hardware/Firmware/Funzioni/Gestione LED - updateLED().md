### `updateLED()`
Funzione del firmware • [[Codice Sorgente - Firmware]] - [[Hardware e Firmware ESP]]

```cpp
void updateLED() {
    bool isConnected = mqttClient.connected();
    bool online = isConnected && currentConfig.name != "Waiting...";

    if (isConnected && !wasConnected)  playSound(SND_CONNESSO);
    if (!isConnected && wasConnected)  playSound(SND_DISCONNESSO);
    wasConnected = isConnected;

    bool fuoriRange = online && (
        currentReadings.temperature < currentConfig.tempMin    ||
        currentReadings.temperature > currentConfig.tempMax    ||
        currentReadings.humidity    < currentConfig.humMin     ||
        currentReadings.humidity    > currentConfig.humMax     ||
        currentReadings.soilHum     < currentConfig.soilHumMin ||
        currentReadings.soilHum     > currentConfig.soilHumMax ||
        currentReadings.luminosity  < currentConfig.luxMin     ||
        currentReadings.luminosity  > currentConfig.luxMax
    );

    digitalWrite(LED_PIN,     online && !fuoriRange ? HIGH : LOW);
    digitalWrite(LED_RED_PIN, !online || fuoriRange ? LOW  : HIGH);
}
```

`online` è `true` solo se MQTT è connesso E la configurazione è già stata ricevuta. Il LED verde non si accende nella finestra tra la connessione MQTT e la ricezione della prima config dal server.

I due LED sono complementari: verde `HIGH` quando tutto è ok, rosso `LOW` (acceso, logica invertita) in caso contrario. Non possono essere contemporaneamente entrambi accesi o entrambi spenti, salvo durante il boot prima di `setup()`.

I suoni di connessione e disconnessione vengono emessi esattamente una volta per evento grazie a `wasConnected` che memorizza lo stato dell'iterazione precedente.
