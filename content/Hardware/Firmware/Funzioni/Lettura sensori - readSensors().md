### `readSensors()`
Funzione del firmware • [[Codice Sorgente - Firmware]] - [[Hardware e Firmware ESP]]

```cpp
void readSensors() {
    float h = dht.readHumidity();
    float t = dht.readTemperature();

    int rawSoil = analogRead(SOIL_PIN);
    float soilPercent = static_cast<float>(map(rawSoil, SOIL_DRY, SOIL_WET, 0, 100));
    currentReadings.soilHum = constrain(soilPercent, 0.0f, 100.0f);

    float lux = lightMeter.readLightLevel();
    if (lux >= 0) currentReadings.luminosity = lux;

    if (!isnan(h) && !isnan(t)) {
        currentReadings.humidity    = h;
        currentReadings.temperature = t - 2.0f;
    } else {
        Serial.println("DHT11: lettura fallita");
    }
}
```

`isnan()` protegge da letture invalide del DHT11: il sensore restituisce `NaN` in caso di errore di comunicazione. Se la lettura fallisce, i valori precedenti nella struct restano invariati.

`map(rawSoil, SOIL_DRY, SOIL_WET, 0, 100)` converte il valore ADC grezzo in percentuale usando i valori di calibrazione. `constrain()` taglia i valori fuori dal range 0-100: può succedere se il terreno è più secco o più bagnato dei valori di calibrazione misurati.

La correzione `t - 2.0f` compensa il self-heating del DHT11: il sensore tende a sovrastimare la temperatura di circa 2°C a causa del calore generato dall'elettronica nelle vicinanze. Il valore di correzione è empirico.

`lux >= 0` filtra le letture di errore del BH1750, che restituisce -1 in caso di fallimento. In quel caso la luminosità precedente viene mantenuta.
