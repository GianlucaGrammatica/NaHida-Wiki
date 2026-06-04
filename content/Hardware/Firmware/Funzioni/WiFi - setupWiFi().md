### `setupWiFi()`
Funzione del firmware • [[Codice Sorgente - Firmware]] - [[Hardware e Firmware ESP]]

```cpp
void setupWiFi() {
    int tentativi = 0;
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    while (WiFi.status() != WL_CONNECTED && tentativi < 20) {
        delay(500);
        yield();
        tentativi++;
        display.setCursor(tentativi * 6, 56);
        display.print(".");
        display.display();
    }
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi fallito, continuo offline");
    }
}
```

È il solo punto del firmware (oltre al boot del DFPlayer) in cui si usano `delay()`: è accettabile perché siamo ancora in `setup()`, non nel loop principale.

Il limite di 20 tentativi (10 secondi) garantisce che il dispositivo parta comunque in modalità offline se la rete non è disponibile. I puntini sull'OLED (uno ogni 500ms, avanzando a destra con `tentativi * 6`) danno feedback visivo del progresso della connessione.