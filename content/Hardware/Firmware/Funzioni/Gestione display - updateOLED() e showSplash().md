### `updateOLED()` e `showSplash()`
Funzione del firmware • [[Codice Sorgente - Firmware]] - [[Hardware e Firmware ESP]]

```cpp
void updateOLED(bool isOnline) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);

    String displayName = currentConfig.name.length() > 12
        ? currentConfig.name.substring(0, 11) + "."
        : currentConfig.name;
    display.setCursor(0, 0);
    display.print(displayName);
    display.setCursor(100, 0);
    display.print(isOnline ? "ON" : "OFF");
    display.drawLine(0, 10, 128, 10, SSD1306_WHITE);

    display.setCursor(0, 14); display.printf("Temp: %.1f C",  currentReadings.temperature);
    display.setCursor(0, 26); display.printf("Hum:  %.1f %%", currentReadings.humidity);
    display.setCursor(0, 38); display.printf("Soil: %.1f %%", currentReadings.soilHum);
    display.setCursor(0, 50); display.printf("Lux:  %.0f",    currentReadings.luminosity);

    display.display();
}

void showSplash() {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(2);
    display.setCursor(10, 5);
    display.print("NaHida");
    display.setTextSize(1);
    display.setCursor(20, 28);
    display.print("Plant Monitor");
    display.drawLine(0, 38, 128, 38, SSD1306_WHITE);
    display.setCursor(0, 44);
    display.print("Connessione WiFi...");
    display.display();
}
```

Il display ha 64 pixel di altezza. Le righe sono posizionate a 0, 14, 26, 38, 50: ogni riga occupa 8 pixel con testo size 1, più 6 pixel di spaziatura. Il nome viene troncato a 12 caratteri per non sovrapporsi al badge ON/OFF posizionato a pixel 100.

`display.display()` è la chiamata che trasferisce il buffer interno al controller del display: tutto il codice prima disegna in RAM locale, solo questa istruzione aggiorna fisicamente lo schermo. Questo evita sfarfallii visibili durante il disegno.
