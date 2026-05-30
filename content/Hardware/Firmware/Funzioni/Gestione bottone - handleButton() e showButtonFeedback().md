### `handleButton()` e `showButtonFeedback()`
Funzione del firmware • [[Codice Sorgente - Firmware]] - [[Hardware e Firmware ESP]]

```cpp
void handleButton() {
    bool currentButtonState = digitalRead(BTN_PIN);
    if (lastButtonState == HIGH && currentButtonState == LOW) {
        if (millis() - lastDebounceTime > 200) {
            lastDebounceTime = millis();
            if (mqttClient.connected()) {
                mqttClient.publish(
                    (String("device/") + DEVICE_TOKEN + "/updates").c_str(),
                    "BUTTON_PRESSED"
                );
                playSound(SND_ACQUA);
            } else {
                playSound(SND_ALERT);
            }
            showButtonFeedback();
        }
    }
    lastButtonState = currentButtonState;
}

void showButtonFeedback() {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);

    if (!mqttClient.connected()) {
        display.setCursor(10, 20);
        display.println("Offline!");
        display.setCursor(10, 32);
        display.println("Riprova dopo.");
    } else {
        display.setCursor(20, 20);
        display.println("Annaffiata!");
    }

    display.display();
    feedbackUntil = millis() + 600;
}
```

Il rilevamento usa il fronte di discesa (`lastButtonState == HIGH && currentButtonState == LOW`): la pressione viene registrata una sola volta all'inizio, non mantenuta per tutta la durata. Il bottone usa `INPUT_PULLUP`, quindi normalmente è `HIGH` e va `LOW` quando premuto.

Il debounce di 200ms filtra i rimbalzi meccanici del pulsante. Il messaggio `"BUTTON_PRESSED"` è una stringa plain text, non JSON: il `MqttListener` lo distingue da un payload JSON controllando l'esito di `json_decode`. Vedi [[MqttListener]].

`feedbackUntil = millis() + 600` imposta il timestamp di scadenza del messaggio di conferma. Il `loop()` vede che `feedbackUntil != 0` e blocca l'aggiornamento normale del display per 600ms, poi lo ripristina.