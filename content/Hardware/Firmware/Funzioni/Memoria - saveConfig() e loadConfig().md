### `saveConfig()` e `loadConfig()`
Funzione del firmware • [[Codice Sorgente - Firmware]] - [[Hardware e Firmware ESP]]

```cpp
void saveConfig() {
    EEPROM.begin(EEPROM_SIZE);
    EEPROM.put(0,  (uint8_t)EEPROM_MAGIC);
    char nameBuf[32] = {};
    currentConfig.name.toCharArray(nameBuf, 32);
    EEPROM.put(1,  nameBuf);
    EEPROM.put(33, currentConfig.humMin);
    EEPROM.put(37, currentConfig.humMax);
    EEPROM.put(41, currentConfig.tempMin);
    EEPROM.put(45, currentConfig.tempMax);
    EEPROM.put(49, currentConfig.soilHumMin);
    EEPROM.put(53, currentConfig.soilHumMax);
    EEPROM.put(57, currentConfig.luxMin);
    EEPROM.put(61, currentConfig.luxMax);
    EEPROM.commit();
    EEPROM.end();
}

void loadConfig() {
    EEPROM.begin(EEPROM_SIZE);
    uint8_t magic;
    EEPROM.get(0, magic);
    if (magic != EEPROM_MAGIC) {
        Serial.println("EEPROM vuota, uso valori default");
        EEPROM.end();
        return;
    }
    char nameBuf[32] = {};
    EEPROM.get(1,  nameBuf);
    EEPROM.get(33, currentConfig.humMin);
    EEPROM.get(37, currentConfig.humMax);
    EEPROM.get(41, currentConfig.tempMin);
    EEPROM.get(45, currentConfig.tempMax);
    EEPROM.get(49, currentConfig.soilHumMin);
    EEPROM.get(53, currentConfig.soilHumMax);
    EEPROM.get(57, currentConfig.luxMin);
    EEPROM.get(61, currentConfig.luxMax);
    EEPROM.end();
    currentConfig.name = String(nameBuf);
}
```

Il magic number `0xAB` è un byte di controllo scritto all'offset 0. Se `loadConfig()` lo trova diverso, l'EEPROM è considerata non inizializzata (primo avvio, o memoria corrotta dopo un aggiornamento firmware) e la funzione restituisce senza modificare la struct, lasciando i valori di default.

`EEPROM.begin()` e `EEPROM.end()` vengono chiamati per ogni operazione invece di tenere la EEPROM aperta globalmente, per rilasciare la RAM del buffer non appena l'operazione è conclusa.

`EEPROM.commit()` è obbligatorio su ESP8266: la libreria scrive in un buffer RAM e `commit()` trasferisce fisicamente i dati nella flash.