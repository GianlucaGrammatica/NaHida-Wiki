### `playSound()`
Funzione del firmware • [[Codice Sorgente - Firmware]] - [[Hardware e Firmware ESP]]

```cpp
void playSound(int track) {
    if (dfReady) dfPlayer.play(track);
}
```

Wrapper minimale sul DFPlayer. Il flag `dfReady` viene impostato in `setup()` solo se `dfPlayer.begin()` ha avuto successo: se il modulo audio non è presente o non risponde, tutte le chiamate a `playSound()` vengono silenziate senza propagare errori al resto del codice.